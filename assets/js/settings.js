const Settings = {
  init() {
    this.displayNameInput = document.getElementById('settings-display-name');
    this.saveNameBtn = document.getElementById('settings-save-name');
    this.themeToggle = document.getElementById('settings-theme-toggle');
    this.deleteAccountBtn = document.getElementById('settings-delete-account');
    this.userHash = document.getElementById('settings-user-hash');
    this.createdAt = document.getElementById('settings-created-at');

    this.saveNameBtn.addEventListener('click', () => this.saveName());
    document.getElementById('settings-save-uid').addEventListener('click', () => this.saveUniqueId());
    this.themeToggle.addEventListener('click', () => this.toggleTheme());
    this.deleteAccountBtn.addEventListener('click', () => this.showDeleteForm());
    document.getElementById('settings-wipe-data').addEventListener('click', () => this.wipeData());
    document.getElementById('delete-confirm-btn').addEventListener('click', () => this.confirmDeleteAccount());
    document.getElementById('delete-cancel-btn').addEventListener('click', () => this.hideDeleteForm());

    // PIN controls
    this._hasPIN = false;
    document.getElementById('pin-enable-btn').addEventListener('click', () => this.showPinSetup('enable'));
    document.getElementById('pin-disable-btn').addEventListener('click', () => this.showPinSetup('disable'));
    document.getElementById('pin-submit-btn').addEventListener('click', () => this.submitPin());
    document.getElementById('pin-cancel-btn').addEventListener('click', () => this.hidePinSetup());

    // TOTP controls
    document.getElementById('totp-enable-btn').addEventListener('click', () => this.showTotpSetup());
    document.getElementById('totp-disable-btn').addEventListener('click', () => this.showTotpDisable());
    document.getElementById('totp-confirm-btn').addEventListener('click', () => this.confirmTotp());
    document.getElementById('totp-cancel-btn').addEventListener('click', () => this.hideTotpSetup());
    document.getElementById('totp-disable-confirm-btn').addEventListener('click', () => this.disableTotp());
    document.getElementById('totp-disable-cancel-btn').addEventListener('click', () => this.hideTotpDisable());

    // Auto-lock timeout
    const autolockSelect = document.getElementById('settings-autolock');
    const savedAutolock = localStorage.getItem('ehcta-autolock') || '300000';
    autolockSelect.value = savedAutolock;
    autolockSelect.addEventListener('change', () => {
      localStorage.setItem('ehcta-autolock', autolockSelect.value);
      resetInactivity();
      Toast.show('Auto-lock timeout updated');
    });

    // Restore appearance settings
    const savedTheme = localStorage.getItem('ehcta-theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      this.themeToggle.classList.add('toggle--active');
    }

    // Header font (FontPicker)
    let savedHeaderFont = localStorage.getItem('ehcta-header-font') || '';
    if (savedHeaderFont === 'default') { savedHeaderFont = ''; localStorage.removeItem('ehcta-header-font'); }
    if (savedHeaderFont) {
      document.getElementById('settings-header-font').value = savedHeaderFont;
      document.documentElement.style.setProperty('--font-title', "'" + savedHeaderFont + "', serif");
    }
    new FontPicker('settings-header-font', (font) => {
      if (font) {
        document.documentElement.style.setProperty('--font-title', "'" + font + "', serif");
        localStorage.setItem('ehcta-header-font', font);
      } else {
        document.documentElement.style.setProperty('--font-title', "'EB Garamond', Garamond, 'Times New Roman', serif");
        localStorage.removeItem('ehcta-header-font');
      }
    }, 'EB Garamond');

    // Body font (FontPicker)
    let savedBodyFont = localStorage.getItem('ehcta-body-font') || '';
    if (savedBodyFont === 'default') { savedBodyFont = ''; localStorage.removeItem('ehcta-body-font'); }
    if (savedBodyFont) {
      document.getElementById('settings-body-font').value = savedBodyFont;
      document.documentElement.style.setProperty('--font-body', "'" + savedBodyFont + "', sans-serif");
    }
    new FontPicker('settings-body-font', (font) => {
      if (font) {
        document.documentElement.style.setProperty('--font-body', "'" + font + "', sans-serif");
        localStorage.setItem('ehcta-body-font', font);
      } else {
        document.documentElement.style.setProperty('--font-body', "'DM Sans', 'Helvetica Neue', Arial, sans-serif");
        localStorage.removeItem('ehcta-body-font');
      }
    }, 'DM Sans');

    // Regenerate seed phrase
    document.getElementById('regen-seed-btn').addEventListener('click', () => this.showRegenSeed());
    document.getElementById('regen-verify-btn').addEventListener('click', () => this.verifyRegenSeed());
    document.getElementById('regen-cancel-btn').addEventListener('click', () => this.hideRegenSeed());
    document.getElementById('regen-copy-btn').addEventListener('click', () => this._copyRegenSeed());
    document.getElementById('regen-done-btn').addEventListener('click', () => this.completeRegenSeed());

    this._initTimezone();
    this._initSession();
    this.load();
    this.loadAuditLog();
  },

  _auditEntries: [],
  _auditFilter: 'all',

  async loadAuditLog() {
    try {
      const entries = await API.get('api/settings/audit');
      const container = document.getElementById('audit-log-list');
      if (!entries || entries.length === 0) {
        container.innerHTML = '<p style="font-size:0.85rem;color:var(--color-text-muted);">No activity yet.</p>';
        return;
      }
      this._auditEntries = entries;
      this._renderAuditLog();
    } catch (e) {}
  },

  _renderAuditLog() {
    const container = document.getElementById('audit-log-list');
    if (!container) return;
    const actionLabels = {
      register: 'Account created', login: 'Login', pin_fail: 'PIN failed',
      delete_account: 'Deleted account', pin_set: 'PIN enabled', pin_remove: 'PIN disabled',
      totp_enable: '2FA enabled', totp_disable: '2FA disabled',
      change_uid: 'Username changed', regen_seed: 'Seed regenerated',
      chat_block: 'User blocked', key_rotate: 'Keys rotated',
      pin_wipe: 'PIN wipe',
    };

    // Get unique action types from entries
    const actionTypes = [...new Set(this._auditEntries.map(e => e.action))];
    const filterCategories = {
      all: 'All',
      login: 'Logins',
      security: 'Security',
      account: 'Account',
      chat: 'Chat',
    };
    const categoryActions = {
      login: ['login', 'pin_fail'],
      security: ['pin_set', 'pin_remove', 'totp_enable', 'totp_disable', 'pin_wipe', 'key_rotate', 'regen_seed'],
      account: ['register', 'delete_account', 'change_uid'],
      chat: ['chat_block'],
    };

    // Filter tabs
    let html = '<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:var(--border-muted);">';
    for (const [key, label] of Object.entries(filterCategories)) {
      const active = this._auditFilter === key;
      html += `<button onclick="Settings._auditFilter='${key}';Settings._renderAuditLog()" style="padding:6px 12px;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.06em;cursor:pointer;background:none;border:none;border-bottom:2px solid ${active ? 'var(--color-accent,#fff)' : 'transparent'};color:${active ? 'var(--color-text)' : 'var(--color-text-muted)'};font-family:var(--font-body);">${label}</button>`;
    }
    html += '</div>';

    // Filter entries
    let filtered = this._auditEntries;
    if (this._auditFilter !== 'all') {
      const allowed = categoryActions[this._auditFilter] || [];
      filtered = this._auditEntries.filter(e => allowed.includes(e.action));
    }

    if (filtered.length === 0) {
      html += '<p style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;padding:16px 0;">No entries in this category.</p>';
    } else {
      html += filtered.map(e => {
        const date = Settings.formatDate(e.created_at);
        const label = actionLabels[e.action] || e.action;
        const detail = e.detail ? ' - ' + e.detail : '';
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:var(--border-muted);font-size:0.8rem;">' +
          '<span>' + label + detail + '</span>' +
          '<span style="color:var(--color-text-muted);white-space:nowrap;margin-left:16px;">' + date + '</span>' +
          '</div>';
      }).join('');
    }

    container.innerHTML = html;
  },

  toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      this.themeToggle.classList.remove('toggle--active');
      localStorage.setItem('ehcta-theme', 'dark');
      Toast.show('Dark mode');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      this.themeToggle.classList.add('toggle--active');
      localStorage.setItem('ehcta-theme', 'light');
      Toast.show('Light mode');
    }
  },

  async load() {
    try {
      const profile = await API.get('api/settings/get');
      this.displayNameInput.value = profile.display_name || '';
      this.userHash.textContent = profile.user_hash || '';
      document.getElementById('settings-unique-id').value = profile.unique_id || '';
      this.createdAt.textContent = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '';

      // PIN state
      this._hasPIN = !!profile.has_pin;
      document.getElementById('pin-status-off').style.display = this._hasPIN ? 'none' : 'block';
      document.getElementById('pin-status-on').style.display = this._hasPIN ? 'block' : 'none';
      this.hidePinSetup();

      // TOTP state
      const hasTotp = !!profile.has_totp;
      document.getElementById('totp-status-off').style.display = hasTotp ? 'none' : 'block';
      document.getElementById('totp-status-on').style.display = hasTotp ? 'block' : 'none';

      this._hasTotp = hasTotp;
      const regenStatus = document.getElementById('regen-seed-status');
      if (hasTotp) {
        regenStatus.textContent = '2FA enabled - regeneration available';
        regenStatus.style.color = 'var(--color-text-muted)';
      } else {
        regenStatus.textContent = 'Requires 2FA to be enabled';
        regenStatus.style.color = 'var(--color-text-muted)';
      }

      const navName = document.getElementById('nav-display-name');
      if (navName) navName.textContent = profile.display_name || 'Anonymous';
    } catch (e) {}
  },

  async saveName() {
    const name = this.displayNameInput.value.trim();
    if (!name) return;
    try {
      await API.post('api/settings/update', { display_name: name });
      Toast.show('Display name updated');
      const navName = document.getElementById('nav-display-name');
      if (navName) navName.textContent = name;
    } catch (e) {
      Toast.show('Failed to save: ' + e.message, true);
    }
  },

  async wipeData() {
    if (!await confirmAction('This will clear all your chats, reset your name and username, and restore all settings to default. Your account stays but the other person keeps their copy of chats. This cannot be undone.', 'Wipe Data')) return;
    try {
      await API.post('api/settings/wipe-data', {});
      Toast.show('All data wiped');
      Crypto.clear();
      window.location.reload();
    } catch (e) {
      Toast.show('Failed: ' + e.message, true);
    }
  },

  showDeleteForm() {
    const form = document.getElementById('delete-confirm-form');
    form.style.display = 'block';
    document.getElementById('delete-seed-input').value = '';
    document.getElementById('delete-pin-input').value = '';
    document.getElementById('delete-totp-input').value = '';
    document.getElementById('delete-error').style.display = 'none';
    // Show PIN/TOTP fields if enabled
    document.getElementById('delete-pin-group').style.display = this._hasPIN ? 'block' : 'none';
    document.getElementById('delete-totp-group').style.display = this._hasTotp ? 'block' : 'none';
    document.getElementById('delete-seed-input').focus();
  },

  hideDeleteForm() {
    document.getElementById('delete-confirm-form').style.display = 'none';
  },

  async confirmDeleteAccount() {
    const seedPhrase = document.getElementById('delete-seed-input').value.trim();
    const pin = document.getElementById('delete-pin-input').value.trim();
    const totpToken = document.getElementById('delete-totp-input').value.trim();
    const errorEl = document.getElementById('delete-error');

    if (!seedPhrase) { errorEl.textContent = 'Enter your seed phrase'; errorEl.style.display = 'block'; return; }

    // Hash seed phrase client-side (same as login)
    const seedHash = await Auth._hashSeed(seedPhrase);

    try {
      await API.post('api/settings/delete-account', { seed_hash: seedHash, pin, totp_token: totpToken });
      Crypto.clear();
      window.location.reload();
    } catch (e) {
      errorEl.textContent = e.message || 'Failed to delete account';
      errorEl.style.display = 'block';
    }
  },

  _pinAction: null,

  showPinSetup(action) {
    this._pinAction = action;
    const form = document.getElementById('pin-setup-form');
    const title = document.getElementById('pin-form-title');
    const confirmGroup = document.getElementById('pin-confirm-group');
    const input = document.getElementById('settings-pin-input');
    const confirm = document.getElementById('settings-pin-confirm');
    input.value = '';
    confirm.value = '';
    form.style.display = 'block';
    if (action === 'enable') {
      title.textContent = 'Set your PIN';
      input.placeholder = 'Enter PIN (4-6 characters)...';
      confirmGroup.style.display = 'block';
    } else {
      title.textContent = 'Enter your current PIN to disable';
      input.placeholder = 'Enter current PIN...';
      confirmGroup.style.display = 'none';
    }
    input.focus();
  },

  hidePinSetup() {
    document.getElementById('pin-setup-form').style.display = 'none';
    document.getElementById('settings-pin-input').value = '';
    document.getElementById('settings-pin-confirm').value = '';
    this._pinAction = null;
  },

  async submitPin() {
    const input = document.getElementById('settings-pin-input').value.trim();
    const confirm = document.getElementById('settings-pin-confirm').value.trim();
    if (this._pinAction === 'enable') {
      if (!input || input.length < 4 || input.length > 6) { Toast.show('PIN must be 4-6 characters', true); return; }
      if (input !== confirm) { Toast.show('PINs do not match', true); return; }
      try {
        await API.post('api/settings/set-pin', { pin: input });
        this._hasPIN = true;
        document.getElementById('pin-status-off').style.display = 'none';
        document.getElementById('pin-status-on').style.display = 'block';
        this.hidePinSetup();
        Toast.show('PIN enabled.');
      } catch (e) { Toast.show('Failed: ' + e.message, true); }
    } else if (this._pinAction === 'disable') {
      if (!input) { Toast.show('Enter your current PIN', true); return; }
      try {
        await API.post('api/settings/remove-pin', { pin: input });
        this._hasPIN = false;
        document.getElementById('pin-status-off').style.display = 'block';
        document.getElementById('pin-status-on').style.display = 'none';
        this.hidePinSetup();
        Toast.show('PIN disabled');
      } catch (e) { Toast.show('Wrong PIN', true); }
    }
  },

  _tzData: [
    { offset: 'GMT-12:00', label: 'Baker Island, Howland Island', tz: 'Etc/GMT+12' },
    { offset: 'GMT-11:00', label: 'American Samoa, Midway Island', tz: 'Pacific/Pago_Pago' },
    { offset: 'GMT-10:00', label: 'Hawaii, Cook Islands', tz: 'Pacific/Honolulu' },
    { offset: 'GMT-9:00', label: 'Alaska', tz: 'America/Anchorage' },
    { offset: 'GMT-8:00', label: 'Pacific Time - Los Angeles, Vancouver', tz: 'America/Los_Angeles' },
    { offset: 'GMT-7:00', label: 'Mountain Time - Denver, Phoenix', tz: 'America/Denver' },
    { offset: 'GMT-6:00', label: 'Central Time - Chicago, Mexico City', tz: 'America/Chicago' },
    { offset: 'GMT-5:00', label: 'Eastern Time - New York, Toronto', tz: 'America/New_York' },
    { offset: 'GMT-4:00', label: 'Atlantic Time - Halifax, San Juan', tz: 'America/Halifax' },
    { offset: 'GMT-3:00', label: 'Buenos Aires, Sao Paulo', tz: 'America/Sao_Paulo' },
    { offset: 'GMT+0:00', label: 'London, Dublin, Lisbon (GMT/UTC)', tz: 'Europe/London' },
    { offset: 'GMT+1:00', label: 'Paris, Berlin, Madrid, Rome', tz: 'Europe/Paris' },
    { offset: 'GMT+2:00', label: 'Helsinki, Bucharest, Athens, Cairo', tz: 'Europe/Helsinki' },
    { offset: 'GMT+3:00', label: 'Moscow, Istanbul, Riyadh', tz: 'Europe/Moscow' },
    { offset: 'GMT+4:00', label: 'Dubai, Baku, Tbilisi', tz: 'Asia/Dubai' },
    { offset: 'GMT+5:00', label: 'Karachi, Tashkent', tz: 'Asia/Karachi' },
    { offset: 'GMT+5:30', label: 'India - Mumbai, Delhi', tz: 'Asia/Kolkata' },
    { offset: 'GMT+6:00', label: 'Dhaka, Almaty', tz: 'Asia/Dhaka' },
    { offset: 'GMT+7:00', label: 'Bangkok, Hanoi, Jakarta', tz: 'Asia/Bangkok' },
    { offset: 'GMT+8:00', label: 'Beijing, Singapore, Hong Kong', tz: 'Asia/Shanghai' },
    { offset: 'GMT+9:00', label: 'Tokyo, Seoul', tz: 'Asia/Tokyo' },
    { offset: 'GMT+10:00', label: 'Sydney, Melbourne, Brisbane', tz: 'Australia/Sydney' },
    { offset: 'GMT+12:00', label: 'Auckland, Wellington, Fiji', tz: 'Pacific/Auckland' },
  ],

  _initTimezone() {
    const input = document.getElementById('settings-timezone');
    if (!input) return;
    const saved = localStorage.getItem('ehcta-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const match = this._tzData.find(t => t.tz === saved);
    if (match) input.value = '(' + match.offset + ') ' + match.label;
    else input.value = saved;

    const drop = document.createElement('div');
    drop.className = 'fp-list';
    document.body.appendChild(drop);

    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:8px;border-bottom:var(--border-muted);position:sticky;top:0;background:var(--color-bg);z-index:1;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'input';
    searchInput.placeholder = 'Search timezone...';
    searchInput.style.cssText = 'width:100%;font-size:0.85rem;padding:6px 10px;';
    searchInput.autocomplete = 'off';
    searchWrap.appendChild(searchInput);

    const listWrap = document.createElement('div');
    drop.appendChild(searchWrap);
    drop.appendChild(listWrap);

    let isOpen = false;
    const render = (query) => {
      const q = (query || '').toLowerCase();
      const filtered = q ? this._tzData.filter(t => t.label.toLowerCase().includes(q) || t.offset.toLowerCase().includes(q)) : this._tzData;
      if (!filtered.length) { listWrap.innerHTML = '<div class="fp-none">No timezones found</div>'; return; }
      listWrap.innerHTML = filtered.map(t =>
        '<div class="fp-row" data-tz="' + t.tz + '" data-offset="' + t.offset + '" data-label="' + t.label + '" style="font-size:0.85rem;">' +
        '<span style="color:var(--color-text-muted);margin-right:8px;flex-shrink:0;font-size:0.75rem;">' + t.offset + '</span>' +
        '<span style="flex:1;">' + t.label + '</span></div>'
      ).join('');
    };
    const show = () => {
      if (isOpen) return;
      isOpen = true;
      searchInput.value = '';
      render('');
      const r = input.getBoundingClientRect();
      drop.style.left = r.left + 'px';
      drop.style.top = r.bottom + 'px';
      drop.style.width = r.width + 'px';
      drop.style.maxHeight = '300px';
      drop.style.overflowY = 'auto';
      drop.classList.add('open');
      setTimeout(() => searchInput.focus(), 50);
    };
    const hide = () => { isOpen = false; drop.classList.remove('open'); };

    input.removeAttribute('readonly');
    input.readOnly = true;
    input.addEventListener('click', () => isOpen ? hide() : show());
    searchInput.addEventListener('input', () => render(searchInput.value));
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    listWrap.addEventListener('click', (e) => {
      const row = e.target.closest('.fp-row');
      if (!row) return;
      input.value = '(' + row.dataset.offset + ') ' + row.dataset.label;
      localStorage.setItem('ehcta-timezone', row.dataset.tz);
      this._updateClock();
      hide();
    });
    drop.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    document.addEventListener('mousedown', (e) => {
      if (isOpen && e.target !== input && !drop.contains(e.target)) hide();
    });
    this._updateClock();
    setInterval(() => this._updateClock(), 1000);
  },

  _updateClock() {
    const el = document.getElementById('settings-current-time');
    if (!el) return;
    const tz = localStorage.getItem('ehcta-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      el.textContent = new Date().toLocaleString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { el.textContent = new Date().toLocaleString(); }
  },

  getTimezone() {
    return localStorage.getItem('ehcta-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  },

  formatDate(iso) {
    if (!iso) return '--';
    const tz = this.getTimezone();
    try {
      return new Date(iso).toLocaleString(undefined, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return new Date(iso).toLocaleString(); }
  },

  async _initSession() {
    try {
      const data = await API.get('api/settings/session');
      if (data.login_time) {
        document.getElementById('session-login-time').textContent = this.formatDate(data.login_time);
        const diff = Date.now() - new Date(data.login_time).getTime();
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(mins / 60);
        document.getElementById('session-duration').textContent = hrs > 0 ? hrs + 'h ' + (mins % 60) + 'm' : mins + 'm';
      }
      document.getElementById('session-ip').textContent = data.ip || '--';
      const ua = data.user_agent || '';
      let browser = 'Unknown';
      if (ua.includes('Edg/')) browser = 'Microsoft Edge';
      else if (ua.includes('Chrome/')) browser = 'Google Chrome';
      else if (ua.includes('Firefox/')) browser = 'Firefox';
      else if (ua.includes('Safari/')) browser = 'Safari';
      document.getElementById('session-browser').textContent = browser;
    } catch (e) {}
  },

  _regenPhrase: null,
  _regenSalt: null,

  showRegenSeed() {
    if (!this._hasTotp) {
      const status = document.getElementById('regen-seed-status');
      if (status) {
        status.textContent = 'You must enable Two-Factor Authentication (2FA) before you can regenerate your seed phrase.';
        status.style.color = '#e74c3c';
      }
      return;
    }
    document.getElementById('regen-step1').style.display = 'block';
    document.getElementById('regen-step2').style.display = 'none';
    document.getElementById('regen-verify-btn').style.display = 'inline-flex';
    document.getElementById('regen-copy-btn').style.display = 'none';
    document.getElementById('regen-done-btn').style.display = 'none';
    document.getElementById('regen-totp-input').value = '';
    document.getElementById('regen-seed-modal').classList.remove('modal-overlay--hidden');
    setTimeout(() => document.getElementById('regen-totp-input').focus(), 100);
  },

  hideRegenSeed() { document.getElementById('regen-seed-modal').classList.add('modal-overlay--hidden'); },

  async verifyRegenSeed() {
    const token = document.getElementById('regen-totp-input').value.trim();
    if (!token || token.length !== 6) { Toast.show('Enter the 6-digit code', true); return; }
    try {
      const data = await API.post('api/settings/regen-seed', { totp_token: token });
      this._regenPhrase = data.seed_phrase;
      this._regenSalt = data.salt;
      const words = data.seed_phrase.split(' ');
      document.getElementById('regen-seed-display').innerHTML = words
        .map((w, i) => '<div class="seed-word"><span class="seed-word__num">' + (i + 1) + '.</span>' + w + '</div>')
        .join('');
      document.getElementById('regen-step1').style.display = 'none';
      document.getElementById('regen-step2').style.display = 'block';
      document.getElementById('regen-verify-btn').style.display = 'none';
      document.getElementById('regen-copy-btn').style.display = 'inline-flex';
      document.getElementById('regen-done-btn').style.display = 'inline-flex';
    } catch (e) { Toast.show(e.message || 'Verification failed', true); }
  },

  _copyRegenSeed() {
    if (this._regenPhrase) { navigator.clipboard.writeText(this._regenPhrase); Toast.show('Seed phrase copied'); }
  },

  async completeRegenSeed() {
    if (!this._regenPhrase || !this._regenSalt) return;
    try {
      await Crypto.init(this._regenPhrase, this._regenSalt);
      this.hideRegenSeed();
      this._regenPhrase = null;
      this._regenSalt = null;
      Toast.show('Seed phrase regenerated. Use your new phrase to log in.');
      this.load();
    } catch (e) { Toast.show('Failed: ' + e.message, true); }
  },

  async saveUniqueId() {
    const uid = document.getElementById('settings-unique-id').value.trim();
    if (!uid || uid.length < 3) { Toast.show('Username must be at least 3 characters', true); return; }
    try {
      await API.post('api/settings/change-uid', { unique_id: uid });
      Toast.show('Username updated to @' + uid);
    } catch (e) { Toast.show(e.message || 'Failed to update username', true); }
  },

  async showTotpSetup() {
    try {
      const data = await API.post('api/settings/totp-setup', {});
      document.getElementById('totp-secret-display').value = data.secret;
      const qrContainer = document.getElementById('totp-qr-container');
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, { text: data.uri, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
      document.getElementById('totp-confirm-input').value = '';
      document.getElementById('totp-setup-modal').classList.remove('modal-overlay--hidden');
      setTimeout(() => document.getElementById('totp-confirm-input').focus(), 100);
    } catch (e) { Toast.show('Setup failed: ' + e.message, true); }
  },

  hideTotpSetup() { document.getElementById('totp-setup-modal').classList.add('modal-overlay--hidden'); },

  async confirmTotp() {
    const token = document.getElementById('totp-confirm-input').value.trim();
    if (!token || token.length !== 6) { Toast.show('Enter the 6-digit code', true); return; }
    try {
      await API.post('api/settings/totp-confirm', { token });
      document.getElementById('totp-status-off').style.display = 'none';
      document.getElementById('totp-status-on').style.display = 'block';
      this.hideTotpSetup();
      Toast.show('Two-factor authentication enabled');
    } catch (e) { Toast.show('Invalid code. Try again.', true); }
  },

  showTotpDisable() {
    document.getElementById('totp-disable-input').value = '';
    document.getElementById('totp-disable-modal').classList.remove('modal-overlay--hidden');
    setTimeout(() => document.getElementById('totp-disable-input').focus(), 100);
  },

  hideTotpDisable() { document.getElementById('totp-disable-modal').classList.add('modal-overlay--hidden'); },

  async disableTotp() {
    const token = document.getElementById('totp-disable-input').value.trim();
    if (!token || token.length !== 6) { Toast.show('Enter the 6-digit code', true); return; }
    try {
      await API.post('api/settings/totp-disable', { token });
      document.getElementById('totp-status-off').style.display = 'block';
      document.getElementById('totp-status-on').style.display = 'none';
      this.hideTotpDisable();
      Toast.show('Two-factor authentication disabled');
    } catch (e) { Toast.show('Invalid code', true); }
  },
};
