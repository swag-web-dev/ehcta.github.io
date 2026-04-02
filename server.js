const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { TOTP, Secret } = require('otpauth');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 5500;

// ── DATABASE SETUP ──
const dbUrl = process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT DEFAULT 'Anonymous',
      salt TEXT NOT NULL,
      settings TEXT DEFAULT '{}',
      unique_id TEXT DEFAULT '',
      pin_hash TEXT DEFAULT '',
      pin_failures INTEGER DEFAULT 0,
      totp_secret TEXT DEFAULT '',
      chat_public_key TEXT DEFAULT '',
      chat_private_key_enc TEXT DEFAULT '',
      chat_private_key_iv TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      ip_hash TEXT PRIMARY KEY,
      attempts TEXT DEFAULT '[]',
      blocked_until INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      initiated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      ciphertext_user1 TEXT NOT NULL,
      ciphertext_user2 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS blocked_users (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );
  `);
  // Migrations - add columns if missing
  const migrations = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment TEXT DEFAULT ''",
    "CREATE TABLE IF NOT EXISTS hidden_conversations (user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, PRIMARY KEY (user_id, conversation_id))",
    "CREATE TABLE IF NOT EXISTS read_receipts (user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, last_read_at TEXT DEFAULT '', PRIMARY KEY (user_id, conversation_id))",
    "CREATE TABLE IF NOT EXISTS typing_status (user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, conversation_id))",
    "CREATE TABLE IF NOT EXISTS pinned_messages (conversation_id TEXT NOT NULL, message_id TEXT NOT NULL, pinned_by TEXT NOT NULL, pinned_at TEXT NOT NULL, PRIMARY KEY (conversation_id, message_id))",
    "CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, encrypted_data TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS key_history (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, chat_public_key TEXT NOT NULL, chat_private_key_enc TEXT NOT NULL, chat_private_key_iv TEXT NOT NULL, created_at TEXT NOT NULL)",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS ttl INTEGER DEFAULT 0",
    "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS default_ttl INTEGER DEFAULT 0",
  ];
  for (const m of migrations) {
    try { await pool.query(m); } catch(e) {}
  }
  // Create indexes (ignore if exists)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_conv_user1 ON conversations(user1_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_conv_user2 ON conversations(user2_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at)`);
}

// Session secret from env or generate a stable one
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const USER_ID_PEPPER = process.env.USER_ID_PEPPER || SESSION_SECRET;

// ── TOTP ENCRYPTION KEY (for encrypting TOTP secrets at rest) ──
const TOTP_KEY = process.env.TOTP_ENCRYPTION_KEY || crypto.createHash('sha256').update(SESSION_SECRET + '_totp').digest();

function encryptTotp(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOTP_KEY, iv);
  let enc = cipher.update(secret, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + enc + ':' + tag;
}

function decryptTotp(stored) {
  if (!stored || !stored.includes(':')) return stored; // legacy plaintext fallback
  const [ivHex, encHex, tagHex] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', TOTP_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dec = decipher.update(encHex, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

// ── MIDDLEWARE ──
if (process.env.NODE_ENV === 'production') app.set('trust proxy', true);

app.use(express.json({ limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss: ws:");
  }
  next();
});

app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) console.log(`${req.method} ${req.url}`);
  next();
});

// ── GLOBAL API RATE LIMITER ──
const apiRateLimits = new Map();
const API_RATE_LIMIT = 100;
const API_RATE_WINDOW = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of apiRateLimits) {
    if (now - entry.windowStart > API_RATE_WINDOW) apiRateLimits.delete(key);
  }
}, 5 * 60 * 1000);

app.use('/api/', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let entry = apiRateLimits.get(ip);
  if (!entry || now - entry.windowStart > API_RATE_WINDOW) {
    entry = { windowStart: now, count: 0 };
    apiRateLimits.set(ip, entry);
  }
  entry.count++;
  if (entry.count > API_RATE_LIMIT) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please wait a moment.' });
  }
  next();
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
}));

// ── HELPERS ──
function genId() { return crypto.randomBytes(8).toString('hex'); }
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  // Update last_seen
  pool.query("UPDATE users SET last_seen = $1 WHERE id = $2", [new Date().toISOString(), req.session.userId]).catch(() => {});
  // Per-user rate limiting
  const now = Date.now();
  const userRateKey = 'user_' + req.session.userId;
  let userEntry = apiRateLimits.get(userRateKey);
  if (!userEntry || now - userEntry.windowStart > API_RATE_WINDOW) {
    userEntry = { windowStart: now, count: 0 };
    apiRateLimits.set(userRateKey, userEntry);
  }
  userEntry.count++;
  if (userEntry.count > API_RATE_LIMIT) {
    return res.status(429).json({ success: false, error: 'Too many requests.' });
  }
  next();
}
function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/auth/') || req.path.startsWith('/api/auth/')) return next();
  const token = req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ success: false, error: 'Invalid CSRF token' });
  }
  next();
}
app.use('/api/', verifyCsrf);

async function auditLog(userId, action, detail) {
  await pool.query('INSERT INTO audit_log (user_id, action, detail, created_at) VALUES ($1, $2, $3, $4)', [userId, action, detail || '', new Date().toISOString()]);
}
function ok(res, data = null) { res.json({ success: true, data }); }
function fail(res, msg, code = 400) { res.status(code).json({ success: false, error: msg }); }

// ── SEED PHRASE ──
const wordlist = JSON.parse(fs.readFileSync(path.join(__dirname, 'vendor', 'bip39-wordlist.json'), 'utf8'));

function generateSeedPhrase() {
  const entropy = crypto.randomBytes(32);
  const hash = crypto.createHash('sha256').update(entropy).digest();
  let bits = '';
  for (let i = 0; i < 32; i++) bits += entropy[i].toString(2).padStart(8, '0');
  bits += hash[0].toString(2).padStart(8, '0');
  const words = [];
  for (let i = 0; i < 24; i++) {
    const index = parseInt(bits.slice(i * 11, (i + 1) * 11), 2);
    words.push(wordlist[index]);
  }
  return words.join(' ');
}

function hashSeedPlain(phrase) {
  const normalized = phrase.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hashSeed(input) {
  return crypto.createHmac('sha256', USER_ID_PEPPER).update(input).digest('hex');
}

// ══════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════

// ── AUTH ──
app.post('/api/auth/register', async (req, res) => {
  try {
    const phrase = generateSeedPhrase();
    const userId = hashSeed(hashSeedPlain(phrase));
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (rows.length) return fail(res, 'Collision, try again');
    const salt = crypto.randomBytes(16).toString('hex');
    const uniqueId = 'user_' + crypto.randomBytes(4).toString('hex');
    await pool.query(
      'INSERT INTO users (id, display_name, salt, settings, unique_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, 'Anonymous', salt, JSON.stringify({ confirm_delete: true }), uniqueId, new Date().toISOString()]
    );
    req.session.userId = userId;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    await auditLog(userId, 'register', 'Account created');
    ok(res, { seed_phrase: phrase, csrf_token: req.session.csrfToken, salt });
  } catch (e) {
    console.error('Register error:', e);
    fail(res, 'Internal error', 500);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    // Accept pre-hashed seed (client-side hashing) or raw phrase (legacy)
    let userId;
    if (req.body.seed_hash) {
      const seedHash = req.body.seed_hash;
      if (!/^[a-f0-9]{64}$/.test(seedHash)) return fail(res, 'Invalid seed hash');
      userId = hashSeed(seedHash);
    } else {
      const phrase = (req.body.seed_phrase || '').trim();
      if (!phrase) return fail(res, 'Seed phrase is required');
      userId = hashSeed(hashSeedPlain(phrase));
    }
    const ip = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
    const now = Math.floor(Date.now() / 1000);

    const rateRes = await pool.query('SELECT * FROM rate_limits WHERE ip_hash = $1', [ip]);
    const rate = rateRes.rows[0];
    let attempts = rate ? JSON.parse(rate.attempts) : [];
    let blockedUntil = rate ? rate.blocked_until : 0;
    attempts = attempts.filter(t => (now - t) < 900);

    if (blockedUntil && now < blockedUntil) {
      return fail(res, 'Too many attempts. Try again later.', 429);
    }
    const userRes = await pool.query('SELECT id, salt, pin_hash, totp_secret, pin_failures FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    if (!user) {
      attempts.push(now);
      const blocked = attempts.length >= 5 ? now + 900 : 0;
      await pool.query(
        'INSERT INTO rate_limits (ip_hash, attempts, blocked_until) VALUES ($1, $2, $3) ON CONFLICT (ip_hash) DO UPDATE SET attempts = $2, blocked_until = $3',
        [ip, JSON.stringify(attempts), blocked]
      );
      return fail(res, 'Invalid seed phrase', 401);
    }

    const needsPin = !!user.pin_hash;
    const totpRaw = user.totp_secret ? decryptTotp(user.totp_secret) : '';
    const needsTotp = !!totpRaw;
    const pin = (req.body.pin || '').trim();
    const totpToken = (req.body.totp_token || '').trim();

    if ((needsPin || needsTotp) && !pin && !totpToken) {
      return ok(res, { requires_verification: true, needs_pin: needsPin, needs_totp: needsTotp });
    }

    if (needsPin) {
      if (!pin) return fail(res, 'PIN is required', 401);
      // Rate limit PIN attempts: enforce 5-second delay between attempts
      const { rows: lastFailRows } = await pool.query("SELECT created_at FROM audit_log WHERE user_id = $1 AND action = 'pin_fail' ORDER BY created_at DESC LIMIT 1", [userId]);
      if (lastFailRows.length && (Date.now() - new Date(lastFailRows[0].created_at).getTime()) < 5000) {
        return fail(res, 'Too fast. Wait a few seconds before trying again.', 429);
      }
      const pinHash = crypto.pbkdf2Sync(pin, user.salt, 100000, 64, 'sha512').toString('hex');
      if (pinHash !== user.pin_hash) {
        const failures = (user.pin_failures || 0) + 1;
        await pool.query('UPDATE users SET pin_failures = $1 WHERE id = $2', [failures, userId]);
        await auditLog(userId, 'pin_fail', 'Attempt ' + failures);
        if (failures >= 3) {
          // Actually wipe: hide all conversations and clear chat keys
          const { rows: convRows } = await pool.query('SELECT id FROM conversations WHERE user1_id = $1 OR user2_id = $1', [userId]);
          for (const conv of convRows) {
            await pool.query('INSERT INTO hidden_conversations (user_id, conversation_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, conv.id]);
          }
          await pool.query("UPDATE users SET chat_public_key = '', chat_private_key_enc = '', chat_private_key_iv = '', pin_failures = 0, pin_hash = '' WHERE id = $1", [userId]);
          await auditLog(userId, 'pin_wipe', 'Data wiped after 3 failed PIN attempts');
          return fail(res, 'Too many failed PIN attempts. Account data wiped.', 401);
        }
        const remaining = 3 - failures;
        return fail(res, 'Invalid PIN. ' + remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.', 401);
      }
      if (user.pin_failures > 0) await pool.query('UPDATE users SET pin_failures = 0 WHERE id = $1', [userId]);
    }

    if (needsTotp) {
      if (!totpToken) return fail(res, 'Authenticator code is required', 401);
      const totp = new TOTP({ secret: Secret.fromBase32(totpRaw), digits: 6, period: 30 });
      const delta = totp.validate({ token: totpToken, window: 1 });
      if (delta === null) return fail(res, 'Invalid authenticator code', 401);
    }

    await pool.query('DELETE FROM rate_limits WHERE ip_hash = $1', [ip]);

    const fullUserRes = await pool.query('SELECT unique_id FROM users WHERE id = $1', [userId]);
    if (!fullUserRes.rows[0].unique_id) {
      const autoId = 'user_' + crypto.randomBytes(4).toString('hex');
      await pool.query('UPDATE users SET unique_id = $1 WHERE id = $2', [autoId, userId]);
    }

    req.session.userId = userId;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    await auditLog(userId, 'login', 'Login success');
    ok(res, { csrf_token: req.session.csrfToken, salt: user.salt, has_pin: !!user.pin_hash });
  } catch (e) {
    console.error('Login error:', e);
    fail(res, 'Internal error', 500);
  }
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => ok(res)); });

app.post('/api/auth/check', async (req, res) => {
  try {
    if (req.session.userId) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
      const user = rows[0];
      if (user) {
        if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        return ok(res, {
          authenticated: true,
          csrf_token: req.session.csrfToken,
          profile: { display_name: user.display_name, created_at: user.created_at, settings: JSON.parse(user.settings) },
          salt: user.salt,
        });
      }
    }
    ok(res, { authenticated: false });
  } catch (e) {
    ok(res, { authenticated: false });
  }
});

// ── SETTINGS ──
app.get('/api/settings/get', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [uid]);
    const user = rows[0];
    if (!user) return fail(res, 'Not found', 404);
    ok(res, {
      user_id: uid,
      display_name: user.display_name,
      created_at: user.created_at,
      settings: JSON.parse(user.settings),
      user_hash: uid.slice(0, 12) + '...',
      unique_id: user.unique_id || '',
      has_pin: !!(user.pin_hash),
      has_totp: !!(user.totp_secret),
    });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/settings/session', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { rows } = await pool.query("SELECT created_at FROM audit_log WHERE user_id = $1 AND action = 'login' ORDER BY created_at DESC LIMIT 1", [uid]);
    ok(res, {
      login_time: rows[0] ? rows[0].created_at : null,
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      user_agent: req.headers['user-agent'] || 'unknown',
    });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/settings/audit', requireAuth, async (req, res) => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { rows } = await pool.query('SELECT action, detail, created_at FROM audit_log WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC', [req.session.userId, threeDaysAgo]);
    ok(res, rows);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/update', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    if (req.body.display_name !== undefined) {
      await pool.query('UPDATE users SET display_name = $1 WHERE id = $2', [req.body.display_name.slice(0, 50), uid]);
    }
    if (req.body.settings) {
      const { rows } = await pool.query('SELECT settings FROM users WHERE id = $1', [uid]);
      const current = JSON.parse(rows[0].settings);
      const merged = { ...current, ...req.body.settings };
      await pool.query('UPDATE users SET settings = $1 WHERE id = $2', [JSON.stringify(merged), uid]);
    }
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/change-uid', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    let newId = (req.body.unique_id || '').trim();
    if (!newId || newId.length < 3 || newId.length > 30) return fail(res, 'Username must be 3-30 characters');
    if (!/^[a-zA-Z0-9_.]+$/.test(newId)) return fail(res, 'Only letters, numbers, underscores and dots allowed');
    const { rows } = await pool.query('SELECT id FROM users WHERE unique_id = $1 AND id != $2', [newId, uid]);
    if (rows.length) return fail(res, 'This username is already taken');
    await pool.query('UPDATE users SET unique_id = $1 WHERE id = $2', [newId, uid]);
    await auditLog(uid, 'change_uid', '@' + newId);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/set-pin', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const pin = (req.body.pin || '').trim();
    if (!pin || pin.length < 4 || pin.length > 6) return fail(res, 'PIN must be 4-6 characters');
    const { rows: userRows } = await pool.query('SELECT salt FROM users WHERE id = $1', [uid]);
    const pinHash = crypto.pbkdf2Sync(pin, userRows[0].salt, 100000, 64, 'sha512').toString('hex');
    await pool.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [pinHash, uid]);
    await auditLog(uid, 'pin_set', 'PIN enabled');
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/remove-pin', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const pin = (req.body.pin || '').trim();
    const { rows } = await pool.query('SELECT pin_hash, salt FROM users WHERE id = $1', [uid]);
    if (rows[0] && rows[0].pin_hash) {
      const pinHash = crypto.pbkdf2Sync(pin, rows[0].salt, 100000, 64, 'sha512').toString('hex');
      if (pinHash !== rows[0].pin_hash) return fail(res, 'Wrong PIN', 403);
    }
    await pool.query("UPDATE users SET pin_hash = '' WHERE id = $1", [uid]);
    await auditLog(uid, 'pin_remove', 'PIN disabled');
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/totp-setup', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.session.userId]);
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ issuer: 'EHCTA', label: rows[0].display_name || 'User', secret, digits: 6, period: 30 });
    req.session.pendingTotpSecret = secret.base32;
    ok(res, { secret: secret.base32, uri: totp.toString() });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/totp-confirm', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const token = (req.body.token || '').trim();
    const pendingSecret = req.session.pendingTotpSecret;
    if (!pendingSecret) return fail(res, 'No pending TOTP setup. Start setup again.');
    const totp = new TOTP({ secret: Secret.fromBase32(pendingSecret), digits: 6, period: 30 });
    const delta = totp.validate({ token, window: 1 });
    if (delta !== null) {
      await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [encryptTotp(pendingSecret), req.session.userId]);
      delete req.session.pendingTotpSecret;
      await auditLog(req.session.userId, 'totp_enable', 'TOTP enabled');
      ok(res);
    } else {
      fail(res, 'Invalid code. Try again.');
    }
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/totp-disable', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const token = (req.body.token || '').trim();
    const { rows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [req.session.userId]);
    if (!rows[0] || !rows[0].totp_secret) return fail(res, 'TOTP is not enabled');
    const totpDecrypted = decryptTotp(rows[0].totp_secret);
    const totp = new TOTP({ secret: Secret.fromBase32(totpDecrypted), digits: 6, period: 30 });
    const delta = totp.validate({ token, window: 1 });
    if (delta !== null) {
      await pool.query("UPDATE users SET totp_secret = '' WHERE id = $1", [req.session.userId]);
      await auditLog(req.session.userId, 'totp_disable', 'TOTP disabled');
      ok(res);
    } else {
      fail(res, 'Invalid code');
    }
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/settings/regen-seed', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const token = (req.body.totp_token || '').trim();
    const { rows: uRows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [uid]);
    if (!uRows[0] || !uRows[0].totp_secret) return fail(res, 'Two-factor authentication must be enabled');
    const regenTotpRaw = decryptTotp(uRows[0].totp_secret);
    const totp = new TOTP({ secret: Secret.fromBase32(regenTotpRaw), digits: 6, period: 30 });
    const delta = totp.validate({ token, window: 1 });
    if (delta === null) return fail(res, 'Invalid authenticator code', 401);

    const newPhrase = generateSeedPhrase();
    const newUserId = hashSeed(hashSeedPlain(newPhrase));
    const newSalt = crypto.randomBytes(16).toString('hex');

    const { rows: existRows } = await pool.query('SELECT id FROM users WHERE id = $1', [newUserId]);
    if (existRows.length) return fail(res, 'Collision, try again');

    // Use a transaction to prevent race conditions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: oldRows } = await client.query('SELECT * FROM users WHERE id = $1', [uid]);
      const oldUser = oldRows[0];
      await client.query(
        'INSERT INTO users (id, display_name, salt, settings, pin_hash, totp_secret, unique_id, chat_public_key, chat_private_key_enc, chat_private_key_iv, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [newUserId, oldUser.display_name, newSalt, oldUser.settings, oldUser.pin_hash||'', oldUser.totp_secret||'', oldUser.unique_id||'', oldUser.chat_public_key||'', oldUser.chat_private_key_enc||'', oldUser.chat_private_key_iv||'', oldUser.created_at]
      );
      await client.query('UPDATE audit_log SET user_id = $1 WHERE user_id = $2', [newUserId, uid]);
      await client.query('UPDATE conversations SET user1_id = $1 WHERE user1_id = $2', [newUserId, uid]);
      await client.query('UPDATE conversations SET user2_id = $1 WHERE user2_id = $2', [newUserId, uid]);
      await client.query('UPDATE conversations SET initiated_by = $1 WHERE initiated_by = $2', [newUserId, uid]);
      await client.query('UPDATE messages SET sender_id = $1 WHERE sender_id = $2', [newUserId, uid]);
      await client.query('DELETE FROM users WHERE id = $1', [uid]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    req.session.userId = newUserId;
    await auditLog(newUserId, 'regen_seed', 'Seed phrase regenerated');
    ok(res, { seed_phrase: newPhrase, salt: newSalt });
  } catch (e) { fail(res, 'Internal error', 500); }
});

// Wipe data: clear chats (one-sided), reset settings/name/username, keep account
app.post('/api/settings/wipe-data', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    // Hide all conversations (one-sided - other person keeps their copy)
    const { rows: convRows } = await pool.query('SELECT id FROM conversations WHERE user1_id = $1 OR user2_id = $1', [uid]);
    for (const conv of convRows) {
      await pool.query('INSERT INTO hidden_conversations (user_id, conversation_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [uid, conv.id]);
    }
    // Clear chat keys (forces regeneration)
    const newUniqueId = 'user_' + crypto.randomBytes(4).toString('hex');
    await pool.query(
      "UPDATE users SET display_name = 'Anonymous', unique_id = $2, settings = '{}', chat_public_key = '', chat_private_key_enc = '', chat_private_key_iv = '', pin_hash = '', pin_failures = 0, totp_secret = '' WHERE id = $1",
      [uid, newUniqueId]
    );
    // Clear read receipts, typing, pinned, blocked
    await pool.query('DELETE FROM read_receipts WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM typing_status WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM blocked_users WHERE blocker_id = $1', [uid]);
    await pool.query('DELETE FROM key_history WHERE user_id = $1', [uid]);
    await auditLog(uid, 'wipe_data', 'All data wiped');
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

// Delete account: requires seed phrase verification + PIN/TOTP if enabled
app.post('/api/settings/delete-account', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const seedHash = (req.body.seed_hash || '').trim();
    const pin = (req.body.pin || '').trim();
    const totpToken = (req.body.totp_token || '').trim();

    if (!seedHash) return fail(res, 'Seed phrase is required');

    // Verify seed phrase matches this account
    const expectedId = hashSeed(seedHash);
    if (expectedId !== uid) return fail(res, 'Invalid seed phrase', 401);

    // Get user to check PIN/TOTP
    const { rows: userRows } = await pool.query('SELECT pin_hash, totp_secret, salt FROM users WHERE id = $1', [uid]);
    const user = userRows[0];
    if (!user) return fail(res, 'User not found', 404);

    // Verify PIN if enabled
    if (user.pin_hash) {
      if (!pin) return fail(res, 'PIN is required');
      const pinHash = crypto.pbkdf2Sync(pin, user.salt, 100000, 64, 'sha512').toString('hex');
      if (pinHash !== user.pin_hash) return fail(res, 'Invalid PIN', 401);
    }

    // Verify TOTP if enabled
    if (user.totp_secret) {
      if (!totpToken) return fail(res, 'Authenticator code is required');
      const totpDecrypted = decryptTotp(user.totp_secret);
      const totp = new TOTP({ secret: Secret.fromBase32(totpDecrypted), digits: 6, period: 30 });
      const delta = totp.validate({ token: totpToken, window: 1 });
      if (delta === null) return fail(res, 'Invalid authenticator code', 401);
    }

    await auditLog(uid, 'delete_account', 'Account deleted');
    // Cascade delete all related data
    await pool.query('DELETE FROM hidden_conversations WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM read_receipts WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM typing_status WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM blocked_users WHERE blocker_id = $1 OR blocked_id = $1', [uid]);
    await pool.query('DELETE FROM pinned_messages WHERE pinned_by = $1', [uid]);
    await pool.query('DELETE FROM audit_log WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE sender_id = $1)', [uid]);
    await pool.query('DELETE FROM key_history WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM messages WHERE sender_id = $1', [uid]);
    await pool.query('DELETE FROM conversations WHERE user1_id = $1 OR user2_id = $1', [uid]);
    await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    req.session.destroy(() => ok(res));
  } catch (e) { fail(res, 'Internal error', 500); }
});

// ── CHAT API ──
app.post('/api/chat/keys/save', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const { public_key, private_key_enc, private_key_iv } = req.body;
    if (!public_key || !private_key_enc || !private_key_iv) return fail(res, 'Missing key data');
    await pool.query('UPDATE users SET chat_public_key = $1, chat_private_key_enc = $2, chat_private_key_iv = $3 WHERE id = $4',
      [public_key, private_key_enc, private_key_iv, req.session.userId]);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/keys/get', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT chat_public_key, chat_private_key_enc, chat_private_key_iv FROM users WHERE id = $1', [req.session.userId]);
    const r = rows[0];
    ok(res, { chat_public_key: r.chat_public_key || '', chat_private_key_enc: r.chat_private_key_enc || '', chat_private_key_iv: r.chat_private_key_iv || '' });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return ok(res, []);
    const { rows } = await pool.query("SELECT unique_id, display_name, chat_public_key FROM users WHERE unique_id LIKE $1 AND id != $2 LIMIT 10", [q + '%', req.session.userId]);
    ok(res, rows.map(r => ({ unique_id: r.unique_id, display_name: r.display_name, has_chat: !!r.chat_public_key })));
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/conversations', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { rows } = await pool.query(`
      SELECT c.id, c.user1_id, c.user2_id, c.status, c.initiated_by, c.created_at, c.default_ttl,
        CASE WHEN c.user1_id = $1 THEN u2.display_name ELSE u1.display_name END AS other_user_name,
        CASE WHEN c.user1_id = $1 THEN u2.unique_id ELSE u1.unique_id END AS other_user_uid,
        CASE WHEN c.user1_id = $1 THEN u2.last_seen ELSE u1.last_seen END AS other_last_seen,
        (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE((SELECT rr.last_read_at FROM read_receipts rr WHERE rr.user_id = $1 AND rr.conversation_id = c.id), '')) AS unread_count
      FROM conversations c
      JOIN users u1 ON u1.id = c.user1_id
      JOIN users u2 ON u2.id = c.user2_id
      WHERE (c.user1_id = $1 OR c.user2_id = $1)
        AND NOT EXISTS (SELECT 1 FROM hidden_conversations hc WHERE hc.user_id = $1 AND hc.conversation_id = c.id)
      ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
    `, [uid]);
    ok(res, rows.map(r => ({
      id: r.id, other_user_name: r.other_user_name, other_user_uid: r.other_user_uid,
      last_message_at: r.last_message_at || r.created_at,
      other_last_seen: r.other_last_seen || '',
      unread_count: parseInt(r.unread_count) || 0,
      status: r.status || 'accepted',
      is_request: r.status === 'pending' && r.initiated_by !== uid,
      is_pending: r.status === 'pending' && r.initiated_by === uid,
      default_ttl: parseInt(r.default_ttl) || 0,
    })));
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/conversations/start', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const targetUid = (req.body.unique_id || '').trim();
    if (!targetUid) return fail(res, 'Missing unique_id');
    const { rows: tRows } = await pool.query('SELECT id, chat_public_key FROM users WHERE unique_id = $1', [targetUid]);
    const target = tRows[0];
    if (!target) return fail(res, 'User not found', 404);
    if (target.id === uid) return fail(res, 'Cannot chat with yourself');

    const { rows: bRows } = await pool.query('SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [uid, target.id]);
    if (bRows.length) return fail(res, 'Cannot message this user', 403);

    const [u1, u2] = [uid, target.id].sort();
    const { rows: cRows } = await pool.query('SELECT id, status FROM conversations WHERE user1_id = $1 AND user2_id = $2', [u1, u2]);
    let conv = cRows[0];

    if (!conv) {
      const convId = genId();
      await pool.query('INSERT INTO conversations (id, user1_id, user2_id, status, initiated_by, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [convId, u1, u2, 'pending', uid, new Date().toISOString()]);
      conv = { id: convId, status: 'pending' };
    }

    const { rows: meRows } = await pool.query('SELECT chat_public_key FROM users WHERE id = $1', [uid]);
    ok(res, { conversation_id: conv.id, status: conv.status, other_public_key: target.chat_public_key || '', my_public_key: meRows[0].chat_public_key || '', user1_id: u1, user2_id: u2 });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/conversations/accept', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.body.conversation_id || '').trim();
    const { rows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    const conv = rows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
    if (conv.initiated_by === uid) return fail(res, 'You initiated this conversation');
    await pool.query('UPDATE conversations SET status = $1 WHERE id = $2', ['accepted', convId]);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/conversations/deny', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.body.conversation_id || '').trim();
    const { rows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    const conv = rows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
    await pool.query('DELETE FROM messages WHERE conversation_id = $1', [convId]);
    await pool.query('DELETE FROM conversations WHERE id = $1', [convId]);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/conversations/block', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.body.conversation_id || '').trim();
    const { rows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    const conv = rows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
    const otherId = conv.user1_id === uid ? conv.user2_id : conv.user1_id;
    await pool.query('INSERT INTO blocked_users (blocker_id, blocked_id, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, otherId, new Date().toISOString()]);
    await pool.query('DELETE FROM messages WHERE conversation_id = $1', [convId]);
    await pool.query('DELETE FROM conversations WHERE id = $1', [convId]);
    await auditLog(uid, 'chat_block', 'Blocked user');
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/messages', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.query.conversation_id || '').trim();
    const after = (req.query.after || '').trim();
    const before = (req.query.before || '').trim();
    if (!convId) return fail(res, 'Missing conversation_id');

    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    const conv = cRows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);

    let rows;
    if (before) {
      const r = await pool.query('SELECT id, conversation_id, sender_id, ciphertext_user1, ciphertext_user2, reply_to, attachment, created_at FROM messages WHERE conversation_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 50', [convId, before]);
      rows = r.rows.reverse();
    } else if (after) {
      const r = await pool.query('SELECT id, conversation_id, sender_id, ciphertext_user1, ciphertext_user2, reply_to, attachment, created_at FROM messages WHERE conversation_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 50', [convId, after]);
      rows = r.rows;
    } else {
      const r = await pool.query('SELECT id, conversation_id, sender_id, ciphertext_user1, ciphertext_user2, reply_to, attachment, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50', [convId]);
      rows = r.rows.reverse();
    }

    // Check if there are older messages
    let has_more = false;
    if (rows.length > 0) {
      const oldest = rows[0].created_at;
      const olderRes = await pool.query('SELECT 1 FROM messages WHERE conversation_id = $1 AND created_at < $2 LIMIT 1', [convId, oldest]);
      has_more = olderRes.rows.length > 0;
    }
    ok(res, { messages: rows, has_more });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/messages/send', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { conversation_id, ciphertext_user1, ciphertext_user2, reply_to, attachment, ttl } = req.body;
    if (!conversation_id || !ciphertext_user1 || !ciphertext_user2) return fail(res, 'Missing fields');

    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversation_id]);
    const conv = cRows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
    if (conv.status === 'pending' && conv.initiated_by !== uid) return fail(res, 'Accept the request first', 403);

    const id = genId();
    const created_at = new Date().toISOString();
    await pool.query('INSERT INTO messages (id, conversation_id, sender_id, ciphertext_user1, ciphertext_user2, reply_to, attachment, ttl, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, conversation_id, uid, ciphertext_user1, ciphertext_user2, reply_to || '', attachment || '', ttl || 0, created_at]);
    broadcastToConversation(conversation_id, uid);
    ok(res, { id, created_at });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/messages/delete', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const msgId = (req.body.message_id || '').trim();
    if (!msgId) return fail(res, 'Missing message_id');

    const { rows: mRows } = await pool.query('SELECT * FROM messages WHERE id = $1', [msgId]);
    const msg = mRows[0];
    if (!msg) return fail(res, 'Message not found', 404);
    if (msg.sender_id !== uid) return fail(res, 'You can only unsend your own messages', 403);

    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [msg.conversation_id]);
    const conv = cRows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);

    await pool.query('DELETE FROM messages WHERE id = $1', [msgId]);
    broadcastToConversation(msg.conversation_id, uid);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/messages/edit', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { message_id, ciphertext_user1, ciphertext_user2 } = req.body;
    if (!message_id || !ciphertext_user1 || !ciphertext_user2) return fail(res, 'Missing fields');

    const { rows: mRows } = await pool.query('SELECT * FROM messages WHERE id = $1', [message_id]);
    const msg = mRows[0];
    if (!msg) return fail(res, 'Message not found', 404);
    if (msg.sender_id !== uid) return fail(res, 'You can only edit your own messages', 403);

    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [msg.conversation_id]);
    const conv = cRows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);

    await pool.query('UPDATE messages SET ciphertext_user1 = $1, ciphertext_user2 = $2 WHERE id = $3', [ciphertext_user1, ciphertext_user2, message_id]);
    broadcastToConversation(msg.conversation_id, uid);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/messages/status', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.query.conversation_id || '').trim();
    if (!convId) return fail(res, 'Missing conversation_id');
    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    const conv = cRows[0];
    if (!conv) return fail(res, 'Conversation not found', 404);
    if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1', [convId]);
    const { rows: lastRows } = await pool.query('SELECT id, ciphertext_user1, ciphertext_user2 FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1', [convId]);
    const last = lastRows[0];
    ok(res, {
      count: parseInt(rows[0].count),
      last_id: last ? last.id : null,
      last_ct1: last ? last.ciphertext_user1.slice(0, 16) : null,
    });
  } catch (e) { fail(res, 'Internal error', 500); }
});

// ── TYPING ──
app.post('/api/chat/typing', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.body.conversation_id || '').trim();
    if (!convId) return ok(res);
    await pool.query('INSERT INTO typing_status (user_id, conversation_id, updated_at) VALUES ($1,$2,$3) ON CONFLICT (user_id, conversation_id) DO UPDATE SET updated_at = $3', [uid, convId, new Date().toISOString()]);
    ok(res);
  } catch (e) { ok(res); }
});

app.get('/api/chat/typing', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.query.conversation_id || '').trim();
    if (!convId) return ok(res, { typing: false });
    const cutoff = new Date(Date.now() - 3000).toISOString();
    const { rows } = await pool.query('SELECT user_id FROM typing_status WHERE conversation_id = $1 AND user_id != $2 AND updated_at > $3', [convId, uid, cutoff]);
    ok(res, { typing: rows.length > 0 });
  } catch (e) { ok(res, { typing: false }); }
});

// ── READ RECEIPTS ──
app.post('/api/chat/read', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.body.conversation_id || '').trim();
    if (!convId) return ok(res);
    await pool.query('INSERT INTO read_receipts (user_id, conversation_id, last_read_at) VALUES ($1,$2,$3) ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = $3', [uid, convId, new Date().toISOString()]);
    ok(res);
  } catch (e) { ok(res); }
});

// ── PIN MESSAGES ──
app.post('/api/chat/messages/pin', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const msgId = (req.body.message_id || '').trim();
    if (!msgId) return fail(res, 'Missing message_id');
    const { rows: mRows } = await pool.query('SELECT * FROM messages WHERE id = $1', [msgId]);
    const msg = mRows[0];
    if (!msg) return fail(res, 'Message not found', 404);
    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [msg.conversation_id]);
    const conv = cRows[0];
    if (!conv || (conv.user1_id !== uid && conv.user2_id !== uid)) return fail(res, 'Not a participant', 403);
    await pool.query('INSERT INTO pinned_messages (conversation_id, message_id, pinned_by, pinned_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [msg.conversation_id, msgId, uid, new Date().toISOString()]);
    broadcastToConversation(msg.conversation_id, uid);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.post('/api/chat/messages/unpin', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const msgId = (req.body.message_id || '').trim();
    if (!msgId) return fail(res, 'Missing message_id');
    const { rows: mRows } = await pool.query('SELECT conversation_id FROM messages WHERE id = $1', [msgId]);
    const msg = mRows[0];
    if (!msg) return fail(res, 'Message not found', 404);
    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [msg.conversation_id]);
    const conv = cRows[0];
    if (!conv || (conv.user1_id !== uid && conv.user2_id !== uid)) return fail(res, 'Not a participant', 403);
    await pool.query('DELETE FROM pinned_messages WHERE conversation_id = $1 AND message_id = $2', [msg.conversation_id, msgId]);
    broadcastToConversation(msg.conversation_id, uid);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/messages/pinned', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.query.conversation_id || '').trim();
    if (!convId) return fail(res, 'Missing conversation_id');
    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    const conv = cRows[0];
    if (!conv || (conv.user1_id !== uid && conv.user2_id !== uid)) return fail(res, 'Not a participant', 403);
    const { rows } = await pool.query(`
      SELECT m.id, m.sender_id, m.ciphertext_user1, m.ciphertext_user2, m.attachment, m.created_at, p.pinned_at
      FROM pinned_messages p
      JOIN messages m ON m.id = p.message_id
      WHERE p.conversation_id = $1
      ORDER BY p.pinned_at ASC
    `, [convId]);
    ok(res, rows);
  } catch (e) { fail(res, 'Internal error', 500); }
});

// ── HIDE CONVERSATION (one-sided delete) ──
app.post('/api/chat/conversations/hide', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.body.conversation_id || '').trim();
    if (!convId) return fail(res, 'Missing conversation_id');
    await pool.query('INSERT INTO hidden_conversations (user_id, conversation_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, convId]);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

// ── WS TOKEN ENDPOINT ──
const wsTokens = new Map();
app.post('/api/ws/token', requireAuth, (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  wsTokens.set(token, { userId: req.session.userId, expires: Date.now() + 30000 });
  ok(res, { token });
});

// ── ATTACHMENTS ──
app.post('/api/chat/attachments/upload', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { message_id, encrypted_data } = req.body;
    if (!message_id || !encrypted_data) return fail(res, 'Missing fields');
    // Verify user is participant in the message's conversation
    const { rows: mRows } = await pool.query('SELECT conversation_id FROM messages WHERE id = $1', [message_id]);
    if (!mRows.length) return fail(res, 'Message not found', 404);
    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [mRows[0].conversation_id]);
    const conv = cRows[0];
    if (!conv || (conv.user1_id !== uid && conv.user2_id !== uid)) return fail(res, 'Not a participant', 403);
    const id = genId();
    await pool.query('INSERT INTO attachments (id, message_id, encrypted_data, created_at) VALUES ($1,$2,$3,$4)', [id, message_id, encrypted_data, new Date().toISOString()]);
    ok(res, { id });
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/attachments/:id', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { rows } = await pool.query('SELECT a.*, m.conversation_id FROM attachments a JOIN messages m ON m.id = a.message_id WHERE a.id = $1', [req.params.id]);
    if (!rows.length) return fail(res, 'Not found', 404);
    const { rows: cRows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [rows[0].conversation_id]);
    const conv = cRows[0];
    if (!conv || (conv.user1_id !== uid && conv.user2_id !== uid)) return fail(res, 'Not a participant', 403);
    ok(res, { encrypted_data: rows[0].encrypted_data });
  } catch (e) { fail(res, 'Internal error', 500); }
});

// ── KEY ROTATION ──
app.post('/api/chat/keys/rotate', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { public_key, private_key_enc, private_key_iv } = req.body;
    if (!public_key || !private_key_enc || !private_key_iv) return fail(res, 'Missing key data');
    // Archive old keys
    const { rows } = await pool.query('SELECT chat_public_key, chat_private_key_enc, chat_private_key_iv FROM users WHERE id = $1', [uid]);
    if (rows[0] && rows[0].chat_public_key) {
      await pool.query('INSERT INTO key_history (user_id, chat_public_key, chat_private_key_enc, chat_private_key_iv, created_at) VALUES ($1,$2,$3,$4,$5)',
        [uid, rows[0].chat_public_key, rows[0].chat_private_key_enc, rows[0].chat_private_key_iv, new Date().toISOString()]);
    }
    // Set new keys
    await pool.query('UPDATE users SET chat_public_key = $1, chat_private_key_enc = $2, chat_private_key_iv = $3 WHERE id = $4',
      [public_key, private_key_enc, private_key_iv, uid]);
    await auditLog(uid, 'key_rotate', 'Chat keys rotated');
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

app.get('/api/chat/keys/history', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT chat_public_key, chat_private_key_enc, chat_private_key_iv, created_at FROM key_history WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
    ok(res, rows);
  } catch (e) { fail(res, 'Internal error', 500); }
});

// ── DISAPPEARING MESSAGES ──
app.post('/api/chat/conversations/ttl', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const uid = req.session.userId;
    const convId = (req.body.conversation_id || '').trim();
    const ttl = parseInt(req.body.ttl) || 0;
    if (!convId) return fail(res, 'Missing conversation_id');
    const { rows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    const conv = rows[0];
    if (!conv || (conv.user1_id !== uid && conv.user2_id !== uid)) return fail(res, 'Not a participant', 403);
    await pool.query('UPDATE conversations SET default_ttl = $1 WHERE id = $2', [ttl, convId]);
    ok(res);
  } catch (e) { fail(res, 'Internal error', 500); }
});

// ── TEMP WIPE ──
app.get('/api/admin/wipe-all', async (req, res) => {
  if (req.query.key !== 'WIPE2026') return res.status(403).json({ error: 'no' });
  try {
    const tables = ['attachments','pinned_messages','typing_status','read_receipts','hidden_conversations','blocked_users','messages','conversations','key_history','audit_log','rate_limits','users'];
    for (const t of tables) { try { await pool.query('DELETE FROM ' + t); } catch(e) {} }
    ok(res, { message: 'wiped' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SERVE FRONTEND ──
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal error' });
});

// ── WEBSOCKET ──
const wsClients = new Map(); // conversationId -> Set of ws connections

function broadcastToConversation(conversationId, excludeUserId) {
  const set = wsClients.get(conversationId);
  if (!set) return;
  const msg = JSON.stringify({ type: 'update', conversation_id: conversationId });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN && ws._userId !== excludeUserId) {
      ws.send(msg);
    }
  }
}

// ── START ──
initDB().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`EHCTA running at http://localhost:${PORT}`);
  });

  const wss = new WebSocket.Server({ server });

  // Clean up expired WS tokens periodically
  setInterval(() => {
    const now = Date.now();
    for (const [token, data] of wsTokens) {
      if (data.expires < now) wsTokens.delete(token);
    }
  }, 60000);

  // Clean up expired disappearing messages every 60 seconds
  setInterval(async () => {
    try {
      await pool.query(`
        DELETE FROM messages
        WHERE ttl > 0
        AND (CAST(EXTRACT(EPOCH FROM CAST(created_at AS TIMESTAMP)) AS INTEGER) + ttl) < EXTRACT(EPOCH FROM NOW())
      `);
    } catch(e) {}
  }, 60000);

  wss.on('connection', (ws) => {
    ws._userId = null;
    ws._convIds = new Set();

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'auth') {
          const tokenData = wsTokens.get(msg.token);
          if (tokenData && tokenData.expires > Date.now()) {
            ws._userId = tokenData.userId;
            wsTokens.delete(msg.token);
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          }
        }
        if (msg.type === 'subscribe' && ws._userId && msg.conversation_id) {
          ws._convIds.add(msg.conversation_id);
          if (!wsClients.has(msg.conversation_id)) wsClients.set(msg.conversation_id, new Set());
          wsClients.get(msg.conversation_id).add(ws);
        }
      } catch(e) {}
    });

    ws.on('close', () => {
      for (const convId of ws._convIds) {
        const set = wsClients.get(convId);
        if (set) { set.delete(ws); if (set.size === 0) wsClients.delete(convId); }
      }
    });
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
