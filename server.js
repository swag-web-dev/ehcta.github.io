const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { TOTP, Secret } = require('otpauth');

const app = express();
const PORT = process.env.PORT || 5500;

// ── DATABASE SETUP ──
// Use RAILWAY_VOLUME_MOUNT_PATH for persistent storage on Railway, otherwise local ./data
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'ehcta.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
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
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    ciphertext_user1 TEXT NOT NULL,
    ciphertext_user2 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_conv_user1 ON conversations(user1_id);
  CREATE INDEX IF NOT EXISTS idx_conv_user2 ON conversations(user2_id);
  CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
  CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  );
`);

// ── MIDDLEWARE ──
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
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
  secret: (function() {
    const secretPath = path.join(dataDir, '.session-secret');
    if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, s);
    return s;
  })(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
}));

// ── HELPERS ──
function genId() { return crypto.randomBytes(8).toString('hex'); }
function sanitizeId(id) { return (id || '').replace(/[^a-f0-9]/g, ''); }
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
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

function auditLog(userId, action, detail) {
  db.prepare('INSERT INTO audit_log (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)').run(userId, action, detail || '', new Date().toISOString());
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

function hashSeed(phrase) {
  const normalized = phrase.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// ══════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════

// ── AUTH ──
app.post('/api/auth/register', (req, res) => {
  try {
    const phrase = generateSeedPhrase();
    const userId = hashSeed(phrase);
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (existing) return fail(res, 'Collision, try again');
    const salt = crypto.randomBytes(16).toString('hex');
    const uniqueId = 'user_' + crypto.randomBytes(4).toString('hex');
    db.prepare('INSERT INTO users (id, display_name, salt, settings, unique_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'Anonymous', salt, JSON.stringify({ confirm_delete: true }), uniqueId, new Date().toISOString());
    req.session.userId = userId;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    auditLog(userId, 'register', 'Account created');
    ok(res, { seed_phrase: phrase, csrf_token: req.session.csrfToken, salt });
  } catch (e) {
    console.error('Register error:', e);
    fail(res, e.message || 'Registration failed', 500);
  }
});

app.post('/api/auth/login', (req, res) => {
  const phrase = (req.body.seed_phrase || '').trim();
  if (!phrase) return fail(res, 'Seed phrase is required');
  const ip = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
  const now = Math.floor(Date.now() / 1000);
  let rate = db.prepare('SELECT * FROM rate_limits WHERE ip_hash = ?').get(ip);
  let attempts = rate ? JSON.parse(rate.attempts) : [];
  let blockedUntil = rate ? rate.blocked_until : 0;
  attempts = attempts.filter(t => (now - t) < 900);
  if (blockedUntil && now < blockedUntil) {
    return fail(res, 'Too many attempts. Try again later.', 429);
  }
  const userId = hashSeed(phrase);
  const user = db.prepare('SELECT id, salt, pin_hash, totp_secret, pin_failures FROM users WHERE id = ?').get(userId);
  if (!user) {
    attempts.push(now);
    const blocked = attempts.length >= 5 ? now + 900 : 0;
    db.prepare('INSERT OR REPLACE INTO rate_limits (ip_hash, attempts, blocked_until) VALUES (?, ?, ?)').run(ip, JSON.stringify(attempts), blocked);
    return fail(res, 'Invalid seed phrase', 401);
  }
  const needsPin = !!user.pin_hash;
  const needsTotp = !!user.totp_secret;
  const pin = (req.body.pin || '').trim();
  const totpToken = (req.body.totp_token || '').trim();
  if ((needsPin || needsTotp) && !pin && !totpToken) {
    return ok(res, { requires_verification: true, needs_pin: needsPin, needs_totp: needsTotp });
  }
  if (needsPin) {
    if (!pin) return fail(res, 'PIN is required', 401);
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    if (pinHash !== user.pin_hash) {
      const failures = (user.pin_failures || 0) + 1;
      db.prepare('UPDATE users SET pin_failures = ? WHERE id = ?').run(failures, userId);
      if (failures >= 3) {
        auditLog(userId, 'pin_wipe', 'Data wiped after 3 failed PIN attempts');
        return fail(res, 'Too many failed PIN attempts. Account data wiped.', 401);
      }
      const remaining = 3 - failures;
      return fail(res, 'Invalid PIN. ' + remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.', 401);
    }
    if (user.pin_failures > 0) db.prepare('UPDATE users SET pin_failures = 0 WHERE id = ?').run(userId);
  }
  if (needsTotp) {
    if (!totpToken) return fail(res, 'Authenticator code is required', 401);
    const totp = new TOTP({ secret: Secret.fromBase32(user.totp_secret), digits: 6, period: 30 });
    const delta = totp.validate({ token: totpToken, window: 1 });
    if (delta === null) return fail(res, 'Invalid authenticator code', 401);
  }
  db.prepare('DELETE FROM rate_limits WHERE ip_hash = ?').run(ip);
  const fullUser = db.prepare('SELECT unique_id FROM users WHERE id = ?').get(userId);
  if (!fullUser.unique_id) {
    const autoId = 'user_' + crypto.randomBytes(4).toString('hex');
    db.prepare('UPDATE users SET unique_id = ? WHERE id = ?').run(autoId, userId);
  }
  req.session.userId = userId;
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  auditLog(userId, 'login', 'Login success');
  ok(res, { csrf_token: req.session.csrfToken, salt: user.salt, has_pin: !!user.pin_hash });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => ok(res)); });

app.post('/api/auth/check', (req, res) => {
  if (req.session.userId) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
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
});

// ── SETTINGS ──
app.get('/api/settings/get', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
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
});

app.get('/api/settings/session', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const lastLogin = db.prepare("SELECT created_at FROM audit_log WHERE user_id = ? AND action = 'login' ORDER BY created_at DESC LIMIT 1").get(uid);
  ok(res, {
    login_time: lastLogin ? lastLogin.created_at : null,
    ip: req.ip || req.socket?.remoteAddress || 'unknown',
    user_agent: req.headers['user-agent'] || 'unknown',
  });
});

app.get('/api/settings/audit', requireAuth, (req, res) => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare('SELECT action, detail, created_at FROM audit_log WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC').all(req.session.userId, threeDaysAgo);
  ok(res, rows);
});

app.post('/api/settings/update', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  if (req.body.display_name !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(req.body.display_name.slice(0, 50), uid);
  }
  if (req.body.settings) {
    const current = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = ?').get(uid).settings);
    const merged = { ...current, ...req.body.settings };
    db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(merged), uid);
  }
  ok(res);
});

app.post('/api/settings/change-uid', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  let newId = (req.body.unique_id || '').trim();
  if (!newId || newId.length < 3 || newId.length > 30) return fail(res, 'Username must be 3-30 characters');
  if (!/^[a-zA-Z0-9_.]+$/.test(newId)) return fail(res, 'Only letters, numbers, underscores and dots allowed');
  const existing = db.prepare('SELECT id FROM users WHERE unique_id = ? AND id != ?').get(newId, uid);
  if (existing) return fail(res, 'This username is already taken');
  db.prepare('UPDATE users SET unique_id = ? WHERE id = ?').run(newId, uid);
  auditLog(uid, 'change_uid', '@' + newId);
  ok(res);
});

app.post('/api/settings/set-pin', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const pin = (req.body.pin || '').trim();
  if (!pin || pin.length < 4 || pin.length > 6) return fail(res, 'PIN must be 4-6 characters');
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(pinHash, uid);
  auditLog(uid, 'pin_set', 'PIN enabled');
  ok(res);
});

app.post('/api/settings/remove-pin', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const pin = (req.body.pin || '').trim();
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(uid);
  if (user && user.pin_hash) {
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    if (pinHash !== user.pin_hash) return fail(res, 'Wrong PIN', 403);
  }
  db.prepare("UPDATE users SET pin_hash = '' WHERE id = ?").run(uid);
  auditLog(uid, 'pin_remove', 'PIN disabled');
  ok(res);
});

app.post('/api/settings/totp-setup', requireAuth, verifyCsrf, (req, res) => {
  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.session.userId);
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: 'EHCTA', label: user.display_name || 'User', secret, digits: 6, period: 30 });
  req.session.pendingTotpSecret = secret.base32;
  ok(res, { secret: secret.base32, uri: totp.toString() });
});

app.post('/api/settings/totp-confirm', requireAuth, verifyCsrf, (req, res) => {
  const token = (req.body.token || '').trim();
  const pendingSecret = req.session.pendingTotpSecret;
  if (!pendingSecret) return fail(res, 'No pending TOTP setup. Start setup again.');
  const totp = new TOTP({ secret: Secret.fromBase32(pendingSecret), digits: 6, period: 30 });
  const delta = totp.validate({ token, window: 1 });
  if (delta !== null) {
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(pendingSecret, req.session.userId);
    delete req.session.pendingTotpSecret;
    auditLog(req.session.userId, 'totp_enable', 'TOTP enabled');
    ok(res);
  } else {
    fail(res, 'Invalid code. Try again.');
  }
});

app.post('/api/settings/totp-disable', requireAuth, verifyCsrf, (req, res) => {
  const token = (req.body.token || '').trim();
  const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.totp_secret) return fail(res, 'TOTP is not enabled');
  const totp = new TOTP({ secret: Secret.fromBase32(user.totp_secret), digits: 6, period: 30 });
  const delta = totp.validate({ token, window: 1 });
  if (delta !== null) {
    db.prepare("UPDATE users SET totp_secret = '' WHERE id = ?").run(req.session.userId);
    auditLog(req.session.userId, 'totp_disable', 'TOTP disabled');
    ok(res);
  } else {
    fail(res, 'Invalid code');
  }
});

app.post('/api/settings/regen-seed', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const token = (req.body.totp_token || '').trim();
  const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(uid);
  if (!user || !user.totp_secret) return fail(res, 'Two-factor authentication must be enabled');
  const totp = new TOTP({ secret: Secret.fromBase32(user.totp_secret), digits: 6, period: 30 });
  const delta = totp.validate({ token, window: 1 });
  if (delta === null) return fail(res, 'Invalid authenticator code', 401);
  const newPhrase = generateSeedPhrase();
  const newUserId = hashSeed(newPhrase);
  const newSalt = crypto.randomBytes(16).toString('hex');
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(newUserId);
  if (existing) return fail(res, 'Collision, try again');
  const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  db.prepare('INSERT INTO users (id, display_name, salt, settings, pin_hash, totp_secret, unique_id, chat_public_key, chat_private_key_enc, chat_private_key_iv, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(newUserId, oldUser.display_name, newSalt, oldUser.settings, oldUser.pin_hash || '', oldUser.totp_secret || '', oldUser.unique_id || '', oldUser.chat_public_key || '', oldUser.chat_private_key_enc || '', oldUser.chat_private_key_iv || '', oldUser.created_at);
  db.prepare('UPDATE audit_log SET user_id = ? WHERE user_id = ?').run(newUserId, uid);
  db.prepare('UPDATE conversations SET user1_id = ? WHERE user1_id = ?').run(newUserId, uid);
  db.prepare('UPDATE conversations SET user2_id = ? WHERE user2_id = ?').run(newUserId, uid);
  db.prepare('UPDATE conversations SET initiated_by = ? WHERE initiated_by = ?').run(newUserId, uid);
  db.prepare('UPDATE messages SET sender_id = ? WHERE sender_id = ?').run(newUserId, uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  req.session.userId = newUserId;
  auditLog(newUserId, 'regen_seed', 'Seed phrase regenerated');
  ok(res, { seed_phrase: newPhrase, salt: newSalt });
});

app.post('/api/settings/delete-account', requireAuth, verifyCsrf, (req, res) => {
  auditLog(req.session.userId, 'delete_account', 'Account deleted');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.session.userId);
  req.session.destroy(() => ok(res));
});

// ── CHAT API ──
app.post('/api/chat/keys/save', requireAuth, verifyCsrf, (req, res) => {
  const { public_key, private_key_enc, private_key_iv } = req.body;
  if (!public_key || !private_key_enc || !private_key_iv) return fail(res, 'Missing key data');
  db.prepare('UPDATE users SET chat_public_key = ?, chat_private_key_enc = ?, chat_private_key_iv = ? WHERE id = ?')
    .run(public_key, private_key_enc, private_key_iv, req.session.userId);
  ok(res);
});

app.get('/api/chat/keys/get', requireAuth, (req, res) => {
  const row = db.prepare('SELECT chat_public_key, chat_private_key_enc, chat_private_key_iv FROM users WHERE id = ?').get(req.session.userId);
  ok(res, { chat_public_key: row.chat_public_key || '', chat_private_key_enc: row.chat_private_key_enc || '', chat_private_key_iv: row.chat_private_key_iv || '' });
});

app.get('/api/chat/search', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return ok(res, []);
  const rows = db.prepare("SELECT unique_id, display_name, chat_public_key FROM users WHERE unique_id LIKE ? AND id != ? LIMIT 10").all(q + '%', req.session.userId);
  ok(res, rows.map(r => ({ unique_id: r.unique_id, display_name: r.display_name, has_chat: !!r.chat_public_key })));
});

app.get('/api/chat/conversations', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const rows = db.prepare(`
    SELECT c.id, c.user1_id, c.user2_id, c.status, c.initiated_by, c.created_at,
      CASE WHEN c.user1_id = ? THEN u2.display_name ELSE u1.display_name END AS other_user_name,
      CASE WHEN c.user1_id = ? THEN u2.unique_id ELSE u1.unique_id END AS other_user_uid,
      (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_message_at
    FROM conversations c
    JOIN users u1 ON u1.id = c.user1_id
    JOIN users u2 ON u2.id = c.user2_id
    WHERE c.user1_id = ? OR c.user2_id = ?
    ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
  `).all(uid, uid, uid, uid);
  ok(res, rows.map(r => ({
    id: r.id, other_user_name: r.other_user_name, other_user_uid: r.other_user_uid,
    last_message_at: r.last_message_at || r.created_at,
    status: r.status || 'accepted',
    is_request: r.status === 'pending' && r.initiated_by !== uid,
    is_pending: r.status === 'pending' && r.initiated_by === uid,
  })));
});

app.post('/api/chat/conversations/start', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const targetUid = (req.body.unique_id || '').trim();
  if (!targetUid) return fail(res, 'Missing unique_id');
  const target = db.prepare('SELECT id, chat_public_key FROM users WHERE unique_id = ?').get(targetUid);
  if (!target) return fail(res, 'User not found', 404);
  if (target.id === uid) return fail(res, 'Cannot chat with yourself');
  const blocked = db.prepare('SELECT 1 FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(uid, target.id, target.id, uid);
  if (blocked) return fail(res, 'Cannot message this user', 403);
  const [u1, u2] = [uid, target.id].sort();
  let conv = db.prepare('SELECT id, status FROM conversations WHERE user1_id = ? AND user2_id = ?').get(u1, u2);
  if (!conv) {
    const convId = genId();
    db.prepare('INSERT INTO conversations (id, user1_id, user2_id, status, initiated_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(convId, u1, u2, 'pending', uid, new Date().toISOString());
    conv = { id: convId, status: 'pending' };
  }
  const me = db.prepare('SELECT chat_public_key FROM users WHERE id = ?').get(uid);
  ok(res, { conversation_id: conv.id, status: conv.status, other_public_key: target.chat_public_key || '', my_public_key: me.chat_public_key || '', user1_id: u1, user2_id: u2 });
});

app.post('/api/chat/conversations/accept', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const convId = (req.body.conversation_id || '').trim();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return fail(res, 'Conversation not found', 404);
  if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
  if (conv.initiated_by === uid) return fail(res, 'You initiated this conversation');
  db.prepare('UPDATE conversations SET status = ? WHERE id = ?').run('accepted', convId);
  ok(res);
});

app.post('/api/chat/conversations/deny', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const convId = (req.body.conversation_id || '').trim();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return fail(res, 'Conversation not found', 404);
  if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(convId);
  ok(res);
});

app.post('/api/chat/conversations/block', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const convId = (req.body.conversation_id || '').trim();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return fail(res, 'Conversation not found', 404);
  if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
  const otherId = conv.user1_id === uid ? conv.user2_id : conv.user1_id;
  db.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(uid, otherId, new Date().toISOString());
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(convId);
  auditLog(uid, 'chat_block', 'Blocked user');
  ok(res);
});

app.get('/api/chat/messages', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const convId = (req.query.conversation_id || '').trim();
  const after = (req.query.after || '').trim();
  if (!convId) return fail(res, 'Missing conversation_id');
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return fail(res, 'Conversation not found', 404);
  if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
  let rows;
  if (after) {
    rows = db.prepare('SELECT id, conversation_id, sender_id, ciphertext_user1, ciphertext_user2, created_at FROM messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 100').all(convId, after);
  } else {
    rows = db.prepare('SELECT id, conversation_id, sender_id, ciphertext_user1, ciphertext_user2, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 100').all(convId);
  }
  ok(res, rows);
});

app.post('/api/chat/messages/send', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const { conversation_id, ciphertext_user1, ciphertext_user2 } = req.body;
  if (!conversation_id || !ciphertext_user1 || !ciphertext_user2) return fail(res, 'Missing fields');
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id);
  if (!conv) return fail(res, 'Conversation not found', 404);
  if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
  if (conv.status === 'pending' && conv.initiated_by !== uid) {
    return fail(res, 'Accept the request first', 403);
  }
  const id = genId();
  const created_at = new Date().toISOString();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, ciphertext_user1, ciphertext_user2, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, conversation_id, uid, ciphertext_user1, ciphertext_user2, created_at);
  ok(res, { id, created_at });
});

app.post('/api/chat/messages/delete', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const msgId = (req.body.message_id || '').trim();
  if (!msgId) return fail(res, 'Missing message_id');
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  if (!msg) return fail(res, 'Message not found', 404);
  if (msg.sender_id !== uid) return fail(res, 'You can only unsend your own messages', 403);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(msg.conversation_id);
  if (!conv) return fail(res, 'Conversation not found', 404);
  if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
  db.prepare('DELETE FROM messages WHERE id = ?').run(msgId);
  ok(res);
});

app.post('/api/chat/messages/edit', requireAuth, verifyCsrf, (req, res) => {
  const uid = req.session.userId;
  const { message_id, ciphertext_user1, ciphertext_user2 } = req.body;
  if (!message_id || !ciphertext_user1 || !ciphertext_user2) return fail(res, 'Missing fields');
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(message_id);
  if (!msg) return fail(res, 'Message not found', 404);
  if (msg.sender_id !== uid) return fail(res, 'You can only edit your own messages', 403);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(msg.conversation_id);
  if (!conv) return fail(res, 'Conversation not found', 404);
  if (conv.user1_id !== uid && conv.user2_id !== uid) return fail(res, 'Not a participant', 403);
  db.prepare('UPDATE messages SET ciphertext_user1 = ?, ciphertext_user2 = ? WHERE id = ?').run(ciphertext_user1, ciphertext_user2, message_id);
  ok(res);
});

// ── SERVE FRONTEND ──
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EHCTA running at http://localhost:${PORT}`);
});
