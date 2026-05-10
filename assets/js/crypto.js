const Crypto = {
  _keys: {},
  _salt: null,
  _keyMaterial: null,
  _saltBytes: null,
  _chatPrivateKey: null,
  _chainStates: {},

  async init(seedPhrase, salt) {
    this._salt = salt;
    await this._deriveAllKeys(seedPhrase, salt);
    // Persist the non-extractable CryptoKey handle (not the raw bytes) to
    // IndexedDB so a tab refresh can resume without re-entering the seed
    // phrase. The raw key never leaves WebCrypto.
    try { await this._saveVault(this._keys['aes-256-gcm'], salt); } catch (e) {}
  },

  async restore() {
    try {
      const stored = await this._loadVault();
      if (!stored || !stored.key || !stored.salt) return false;
      this._keys['aes-256-gcm'] = stored.key;
      this._keys[256] = stored.key;
      this._salt = stored.salt;
      this._saltBytes = this._hexToBytes(stored.salt);
      return true;
    } catch (e) {
      return false;
    }
  },

  async clear() {
    this._keys = {};
    this._salt = null;
    this._keyMaterial = null;
    this._chatPrivateKey = null;
    this._chainStates = {};
    // Wipe legacy sessionStorage entries from prior versions of this app
    sessionStorage.removeItem('_dk');
    sessionStorage.removeItem('_salt');
    await this._clearVault();
  },

  async _deriveAllKeys(seedPhrase, salt) {
    const enc = new TextEncoder();
    this._keyMaterial = await window.crypto.subtle.importKey(
      'raw', enc.encode(seedPhrase), 'PBKDF2', false, ['deriveKey', 'deriveBits']
    );
    this._saltBytes = this._hexToBytes(salt);

    // extractable=false: the raw key bytes can never be read back out via
    // exportKey, so they cannot leak through console, sessionStorage, XSS, etc.
    this._keys['aes-256-gcm'] = await window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this._saltBytes, iterations: 600000, hash: 'SHA-256' },
      this._keyMaterial,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );

    this._keys[256] = this._keys['aes-256-gcm'];
  },

  // ══ INDEXEDDB VAULT (CryptoKey handle storage) ══

  _openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ehcta_vault', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keys');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async _saveVault(key, salt) {
    const db = await this._openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put({ key, salt }, 'vault');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  },

  async _loadVault() {
    const db = await this._openDb();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readonly');
      const req = tx.objectStore('keys').get('vault');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  },

  async _clearVault() {
    try {
      const db = await this._openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').delete('vault');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (e) {}
  },

  // ══ MESSAGE CHAIN STATE ══

  async _advanceChain(convId) {
    if (!this._chainStates[convId]) {
      this._chainStates[convId] = { counter: 0, hash: '' };
    }
    const state = this._chainStates[convId];
    state.counter++;
    const enc = new TextEncoder();
    const data = enc.encode(convId + ':' + state.counter + ':' + state.hash);
    const hashBuf = await window.crypto.subtle.digest('SHA-256', data);
    state.hash = this._bytesToBase64(new Uint8Array(hashBuf));
    return { counter: state.counter, hash: state.hash };
  },

  // ══ CHAT ENCRYPTION (RSA-4096 hybrid) ══

  // Domain-separator for the AES-GCM AAD on the wrapped private-key blob.
  // Bumping this string will break legacy reads, so the load path falls back
  // to no-AAD decryption (older blobs) before failing.
  _PRIV_AAD: new TextEncoder().encode('ehcta-vault-v1'),

  async generateChatKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
      true, ['encrypt', 'decrypt']
    );
    const pubJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // Encrypt private key with vault AES-256-GCM key, with AAD so cross-user
    // or cross-context blob substitution by the server fails closed instead
    // of silently producing the wrong key.
    const privJson = JSON.stringify(privJwk);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const vaultKey = this._keys['aes-256-gcm'];
    const ct = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: this._PRIV_AAD },
      vaultKey,
      enc.encode(privJson)
    );

    return {
      publicKey: JSON.stringify(pubJwk),
      privateKeyEnc: this._bytesToBase64(new Uint8Array(ct)),
      privateKeyIv: this._bytesToBase64(iv),
      _privateKey: keyPair.privateKey,
    };
  },

  async loadChatPrivateKey(encB64, ivB64) {
    const vaultKey = this._keys['aes-256-gcm'];
    const ct = this._base64ToBytes(encB64);
    const iv = this._base64ToBytes(ivB64);
    let privJson;
    try {
      privJson = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: this._PRIV_AAD },
        vaultKey, ct
      );
    } catch (e) {
      // Back-compat: blobs created before AAD was added. Try plain decrypt.
      privJson = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultKey, ct);
    }
    const privJwk = JSON.parse(new TextDecoder().decode(privJson));
    this._chatPrivateKey = await window.crypto.subtle.importKey('jwk', privJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  },

  // SHA-256 of the canonical SPKI bytes of a public key, formatted as 64 hex
  // chars in groups of 4. Hashing SPKI (not the JWK JSON text) means two
  // endpoints that re-serialize the same key always compute the same value.
  // Compared visually by humans to detect MITM key swaps.
  async getKeyFingerprint(pubKeyJson) {
    const jwk = JSON.parse(pubKeyJson);
    if (!this._validatePubJwk(jwk)) throw new Error('Invalid public key');
    const pubKey = await window.crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']
    );
    const spki = await window.crypto.subtle.exportKey('spki', pubKey);
    const hash = await window.crypto.subtle.digest('SHA-256', spki);
    const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.match(/.{4}/g).join(' ');
  },

  // Strict JWK validation. Refuses anything that isn't an RSA-4096 public key
  // with the standard exponent — defends against a malicious server shipping
  // a degenerate-but-importable key.
  _validatePubJwk(jwk) {
    if (!jwk || jwk.kty !== 'RSA') return false;
    if (jwk.e !== 'AQAB') return false;
    if (typeof jwk.n !== 'string') return false;
    // Base64url-decoded modulus length: 4096 bits = 512 bytes. Allow ±1 for
    // base64url padding edge cases.
    const nBytes = Math.floor((jwk.n.length * 3) / 4);
    if (nBytes < 510 || nBytes > 514) return false;
    return true;
  },

  // ── PUBLIC-KEY PINNING (TOFU) ──
  // First time we see a peer's pubkey, save it. Every subsequent load, compare.
  // If the server ever swaps a pubkey, pinCheckPeer returns 'changed' and the
  // UI must block messaging until the user re-verifies via fingerprint compare.
  async pinCheckPeer(peerUid, pubKeyJson) {
    if (!peerUid || !pubKeyJson) return 'missing';
    try {
      const db = await this._openDb();
      const stored = await new Promise((resolve, reject) => {
        const tx = db.transaction('keys', 'readonly');
        const req = tx.objectStore('keys').get('pin:' + peerUid);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (!stored) {
        await this._pinSavePeer(peerUid, pubKeyJson);
        return 'first-use';
      }
      return stored === pubKeyJson ? 'match' : 'changed';
    } catch (e) {
      return 'error';
    }
  },

  async pinAcceptPeer(peerUid, pubKeyJson) {
    return this._pinSavePeer(peerUid, pubKeyJson);
  },

  async _pinSavePeer(peerUid, pubKeyJson) {
    const db = await this._openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(pubKeyJson, 'pin:' + peerUid);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  },

  // Wire format: base64( wk(512 bytes RSA-OAEP-4096 ciphertext) || iv(12) || ct(rest) ).
  // No JSON, no field labels — bytes are indistinguishable from random to a
  // structure-detection tool. RSA-4096 ciphertext is always exactly 512 bytes.
  async encryptForChat(plaintext, recipientPubKeyJson) {
    const pubJwk = JSON.parse(recipientPubKeyJson);
    if (!this._validatePubJwk(pubJwk)) throw new Error('Recipient public key failed validation');
    const pubKey = await window.crypto.subtle.importKey('jwk', pubJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);

    const aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext));
    const rawAes = await window.crypto.subtle.exportKey('raw', aesKey);
    const wrappedKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawAes);

    const wk = new Uint8Array(wrappedKey);
    const ctBytes = new Uint8Array(ct);
    const out = new Uint8Array(wk.length + iv.length + ctBytes.length);
    out.set(wk, 0);
    out.set(iv, wk.length);
    out.set(ctBytes, wk.length + iv.length);
    return this._bytesToBase64(out);
  },

  async decryptChatMessage(ciphertextB64) {
    if (!this._chatPrivateKey) throw new Error('Chat private key not loaded');
    const blob = this._base64ToBytes(ciphertextB64);

    // Auto-detect the legacy {wk, iv, ct} JSON format so messages encrypted
    // before the binary format change still decrypt.
    let legacy = null;
    try {
      const candidate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(blob));
      if (candidate && typeof candidate.wk === 'string' && typeof candidate.iv === 'string' && typeof candidate.ct === 'string') {
        legacy = candidate;
      }
    } catch (e) {}

    let wrappedKey, iv, ct;
    if (legacy) {
      wrappedKey = this._base64ToBytes(legacy.wk);
      iv = this._base64ToBytes(legacy.iv);
      ct = this._base64ToBytes(legacy.ct);
    } else {
      wrappedKey = blob.slice(0, 512);
      iv = blob.slice(512, 524);
      ct = blob.slice(524);
    }

    const rawAes = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, this._chatPrivateKey, wrappedKey);
    const aesKey = await window.crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt']);
    const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
    return new TextDecoder().decode(pt);
  },

  // ── ATTACHMENT WIRE FORMAT ──
  // Two-recipient envelope: [u32 BE: len(ct1)] [ct1] [ct2], base64'd.
  // Replaces the old JSON.stringify({att_ct1, att_ct2}) wrapper that exposed
  // a structurally-distinctive payload to format-detection scanners.
  packAttachmentEnvelope(ct1B64, ct2B64) {
    const ct1 = this._base64ToBytes(ct1B64);
    const ct2 = this._base64ToBytes(ct2B64);
    const out = new Uint8Array(4 + ct1.length + ct2.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, ct1.length, false); // big-endian
    out.set(ct1, 4);
    out.set(ct2, 4 + ct1.length);
    return this._bytesToBase64(out);
  },

  // Returns [ct1B64, ct2B64] for a binary envelope, or null if the input
  // looks like the legacy JSON format. The chat layer falls back accordingly.
  unpackAttachmentEnvelope(envelopeB64) {
    let blob;
    try { blob = this._base64ToBytes(envelopeB64); } catch (e) { return null; }
    // Legacy detection: JSON object starts with `{`.
    if (blob.length === 0 || blob[0] === 0x7B) return null;
    if (blob.length < 5) return null;
    const len1 = new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getUint32(0, false);
    if (len1 < 0 || 4 + len1 > blob.length) return null;
    const ct1 = blob.slice(4, 4 + len1);
    const ct2 = blob.slice(4 + len1);
    return [this._bytesToBase64(ct1), this._bytesToBase64(ct2)];
  },

  // ═══════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════

  _bytesToBase64(bytes) {
    let b = '';
    for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
    return btoa(b);
  },

  _base64ToBytes(b64) {
    const b = atob(b64);
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  },

  _hexToBytes(hex) {
    const u = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) u[i / 2] = parseInt(hex.substr(i, 2), 16);
    return u;
  },
};
