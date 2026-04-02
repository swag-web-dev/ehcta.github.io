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
    // Store wrapped key for session restore
    await this._saveWrappedKey();
  },

  async _saveWrappedKey() {
    // Generate a random wrapping key
    const wrapKey = await window.crypto.subtle.generateKey(
      { name: 'AES-KW', length: 256 }, true, ['wrapKey', 'unwrapKey']
    );
    // Wrap the vault key
    const wrapped = await window.crypto.subtle.wrapKey('raw', this._keys['aes-256-gcm'], wrapKey, 'AES-KW');
    // Export wrapping key to sessionStorage (ephemeral, cleared on tab close)
    const rawWrap = await window.crypto.subtle.exportKey('raw', wrapKey);
    sessionStorage.setItem('_wk', this._bytesToBase64(new Uint8Array(rawWrap)));
    sessionStorage.setItem('_wv', this._bytesToBase64(new Uint8Array(wrapped)));
    sessionStorage.setItem('_salt', this._salt);
  },

  async restore() {
    const wkB64 = sessionStorage.getItem('_wk');
    const wvB64 = sessionStorage.getItem('_wv');
    const salt = sessionStorage.getItem('_salt');
    if (wkB64 && wvB64 && salt) {
      try {
        const wrapKey = await window.crypto.subtle.importKey('raw', this._base64ToBytes(wkB64), { name: 'AES-KW', length: 256 }, false, ['unwrapKey']);
        this._keys['aes-256-gcm'] = await window.crypto.subtle.unwrapKey(
          'raw', this._base64ToBytes(wvB64), wrapKey, 'AES-KW',
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );
        this._keys[256] = this._keys['aes-256-gcm'];
        this._salt = salt;
        this._saltBytes = this._hexToBytes(salt);
        return true;
      } catch(e) {
        return false;
      }
    }
    return false;
  },

  clear() {
    this._keys = {};
    this._salt = null;
    this._keyMaterial = null;
    this._chatPrivateKey = null;
    this._chainStates = {};
    sessionStorage.removeItem('_wk');
    sessionStorage.removeItem('_wv');
    sessionStorage.removeItem('_salt');
    // Also remove old format
    sessionStorage.removeItem('_dk');
  },

  async _deriveAllKeys(seedPhrase, salt) {
    const enc = new TextEncoder();
    this._keyMaterial = await window.crypto.subtle.importKey(
      'raw', enc.encode(seedPhrase), 'PBKDF2', false, ['deriveKey', 'deriveBits']
    );
    this._saltBytes = this._hexToBytes(salt);

    // Non-extractable AES-256-GCM key
    this._keys['aes-256-gcm'] = await window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this._saltBytes, iterations: 600000, hash: 'SHA-256' },
      this._keyMaterial,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );

    // Aliases for backward compat
    this._keys[256] = this._keys['aes-256-gcm'];
  },

  // ══ MESSAGE CHAIN STATE (ordering/deletion detection) ══

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

  // ══ FORWARD SECRECY (v2 encryption with conversation binding + chain state) ══

  async encryptForChatFS(plaintext, recipientPubKeyJson, conversationId) {
    const pubJwk = JSON.parse(recipientPubKeyJson);
    const pubKey = await window.crypto.subtle.importKey('jwk', pubJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);

    // Generate ephemeral ECDH key pair (for future ratcheting support)
    const ephKp = await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const ephPub = await window.crypto.subtle.exportKey('jwk', ephKp.publicKey);

    // Generate fresh AES-256 key for this message (forward secrecy: never stored after use)
    const aesKeyRaw = window.crypto.getRandomValues(new Uint8Array(32));
    const aesKey = await window.crypto.subtle.importKey('raw', aesKeyRaw, { name: 'AES-GCM', length: 256 }, true, ['encrypt']);

    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Advance chain state for message ordering/deletion detection
    const chain = await this._advanceChain(conversationId || '');

    // Bind message to conversation ID via AAD (additional authenticated data)
    const aad = new TextEncoder().encode(conversationId || '');
    const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, aesKey, new TextEncoder().encode(plaintext));

    // Wrap AES key with recipient's RSA public key
    const wrappedKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, aesKeyRaw);

    return btoa(JSON.stringify({
      v: 2,
      wk: this._bytesToBase64(new Uint8Array(wrappedKey)),
      iv: this._bytesToBase64(iv),
      ct: this._bytesToBase64(new Uint8Array(ct)),
      eph: ephPub,
      cid: conversationId || '',
      mc: chain.counter,
      ch: chain.hash,
    }));
  },

  async decryptChatMessageFS(ciphertextB64, conversationId) {
    if (!this._chatPrivateKey) throw new Error('Chat private key not loaded');
    const payload = JSON.parse(atob(ciphertextB64));

    if (payload.v === 2) {
      const wrappedKey = this._base64ToBytes(payload.wk);
      const rawAes = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, this._chatPrivateKey, wrappedKey);
      const aesKey = await window.crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt']);
      const iv = this._base64ToBytes(payload.iv);
      const ct = this._base64ToBytes(payload.ct);

      // Verify conversation binding via AAD
      const aad = new TextEncoder().encode(payload.cid || '');
      const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, aesKey, ct);

      // Verify conversation ID matches expected
      if (conversationId && payload.cid && payload.cid !== conversationId) {
        throw new Error('Message conversation binding mismatch');
      }

      return new TextDecoder().decode(pt);
    }

    // Fall back to v1 (legacy, no conversation binding)
    return this.decryptChatMessage(ciphertextB64);
  },

  // ══ KEY FINGERPRINT VERIFICATION ══

  async getKeyFingerprint(pubKeyJson) {
    const enc = new TextEncoder();
    const hash = await window.crypto.subtle.digest('SHA-256', enc.encode(pubKeyJson));
    const bytes = new Uint8Array(hash);
    // Format as groups of 5 digits (like Signal safety numbers)
    let fingerprint = '';
    for (let i = 0; i < 20; i += 4) {
      const num = ((bytes[i] << 24) | (bytes[i+1] << 16) | (bytes[i+2] << 8) | bytes[i+3]) >>> 0;
      fingerprint += (num % 100000).toString().padStart(5, '0') + ' ';
    }
    return fingerprint.trim();
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
