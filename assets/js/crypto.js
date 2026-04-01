const Crypto = {
  _keys: {},
  _salt: null,
  _keyMaterial: null,
  _saltBytes: null,
  _chatPrivateKey: null,

  async init(seedPhrase, salt) {
    this._salt = salt;
    await this._deriveAllKeys(seedPhrase, salt);
    // Store derived key (not seed phrase) in sessionStorage
    const rawKey = await window.crypto.subtle.exportKey('raw', this._keys['aes-256-gcm']);
    sessionStorage.setItem('_dk', this._bytesToBase64(new Uint8Array(rawKey)));
    sessionStorage.setItem('_salt', salt);
  },

  async restore() {
    const dk = sessionStorage.getItem('_dk');
    const salt = sessionStorage.getItem('_salt');
    if (dk && salt) {
      const rawKey = this._base64ToBytes(dk);
      this._keys['aes-256-gcm'] = await window.crypto.subtle.importKey(
        'raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
      );
      this._keys[256] = this._keys['aes-256-gcm'];
      this._salt = salt;
      this._saltBytes = this._hexToBytes(salt);
      return true;
    }
    return false;
  },

  clear() {
    this._keys = {};
    this._salt = null;
    this._keyMaterial = null;
    this._chatPrivateKey = null;
    sessionStorage.removeItem('_dk');
    sessionStorage.removeItem('_salt');
  },

  async _deriveAllKeys(seedPhrase, salt) {
    const enc = new TextEncoder();
    this._keyMaterial = await window.crypto.subtle.importKey(
      'raw', enc.encode(seedPhrase), 'PBKDF2', false, ['deriveKey', 'deriveBits']
    );
    this._saltBytes = this._hexToBytes(salt);

    // AES-256-GCM (exportable, also used for 192 derivation)
    this._keys['aes-256-gcm'] = await window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this._saltBytes, iterations: 600000, hash: 'SHA-256' },
      this._keyMaterial,
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );

    // Aliases for backward compat
    this._keys[256] = this._keys['aes-256-gcm'];
  },

  // ══ CHAT ENCRYPTION (RSA-4096 hybrid) ══

  async generateChatKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
      true, ['encrypt', 'decrypt']
    );
    const pubJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // Encrypt private key with vault AES-256-GCM key
    const privJson = JSON.stringify(privJwk);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const vaultKey = this._keys['aes-256-gcm'];
    const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, enc.encode(privJson));

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
    const privJson = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultKey, ct);
    const privJwk = JSON.parse(new TextDecoder().decode(privJson));
    this._chatPrivateKey = await window.crypto.subtle.importKey('jwk', privJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  },

  async encryptForChat(plaintext, recipientPubKeyJson) {
    const pubJwk = JSON.parse(recipientPubKeyJson);
    const pubKey = await window.crypto.subtle.importKey('jwk', pubJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);

    const aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext));
    const rawAes = await window.crypto.subtle.exportKey('raw', aesKey);
    const wrappedKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawAes);

    return btoa(JSON.stringify({
      wk: this._bytesToBase64(new Uint8Array(wrappedKey)),
      iv: this._bytesToBase64(iv),
      ct: this._bytesToBase64(new Uint8Array(ct)),
    }));
  },

  async decryptChatMessage(ciphertextB64) {
    if (!this._chatPrivateKey) throw new Error('Chat private key not loaded');
    const payload = JSON.parse(atob(ciphertextB64));
    const wrappedKey = this._base64ToBytes(payload.wk);
    const rawAes = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, this._chatPrivateKey, wrappedKey);
    const aesKey = await window.crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = this._base64ToBytes(payload.iv);
    const ct = this._base64ToBytes(payload.ct);
    const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
    return new TextDecoder().decode(pt);
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
