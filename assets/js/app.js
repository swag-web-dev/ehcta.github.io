const Toast = {
  container: null,
  maxVisible: 3,
  init() { this.container = document.getElementById('toast-container'); },
  show(message, isError = false) {
    if (!this.container) this.init();
    while (this.container.children.length >= this.maxVisible) {
      this.container.removeChild(this.container.firstElementChild);
    }
    const toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' toast--error' : '');
    toast.textContent = message;
    this.container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },
};

const App = {
  async init() {
    const preloader = document.getElementById('preloader');
    const minTime = new Promise((r) => setTimeout(r, 1800));
    await Promise.all([minTime, this._waitForLoad()]);
    preloader.classList.add('preloader--hidden');
    Toast.init();

    try {
      const data = await API.post('api/auth/check', {});
      if (data.authenticated) {
        API.setToken(data.csrf_token);
        const restored = await Crypto.restore();
        if (restored) { this.showApp(); return; }
      }
    } catch (e) {}
    this.showLogin();
  },

  _waitForLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve);
    });
  },

  showLogin() {
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('app-view').style.display = 'none';
    Auth.init();
  },

  showApp() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-view').style.display = 'block';
    resetInactivity();

    if (window.Lenis) new Lenis({ autoRaf: true });

    // Default to chat
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#chat';
    }
    this._initTabs();

    if (window.location.hash === '#settings') this.enterSettings();

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try { await API.post('api/auth/logout', {}); } catch(e) {}
      Chat.destroy();
      Crypto.clear();
      sessionStorage.clear();
      window.location.reload();
    });

    // Settings cog
    document.getElementById('settings-nav-btn').addEventListener('click', () => App.enterSettings());

    // Settings sub-nav clicks
    document.querySelectorAll('#nav-settings-tabs .nav__tab[data-settings-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        App.showSettingsSection(btn.dataset.settingsSection);
        document.querySelectorAll('#nav-settings-tabs .nav__tab').forEach(b => b.classList.remove('nav__tab--active'));
        btn.classList.add('nav__tab--active');
      });
    });

    try { Settings.init(); } catch(e) { console.error('Settings init error:', e); }
    try { Chat.init(); } catch(e) { console.error('Chat init error:', e); }

    // Open chat on load
    if (window.location.hash === '#chat') {
      try { Chat.open(); } catch(e) {}
    }
  },

  _initTabs() {
    const tabs = document.querySelectorAll('#nav-main-tabs .nav__tab');
    const sections = document.querySelectorAll('.tab-section');
    const activate = (hash) => {
      const target = hash || '#chat';
      tabs.forEach((t) => t.classList.toggle('nav__tab--active', t.dataset.tab === target));
      sections.forEach((s) => s.classList.toggle('tab-section--active', '#' + s.id.replace('-section', '') === target));
    };
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        window.location.hash = tab.dataset.tab;
        activate(tab.dataset.tab);
      });
    });
    window.addEventListener('hashchange', () => activate(window.location.hash));
    activate(window.location.hash || '#chat');
  },

  goToTab(hash) {
    window.location.hash = hash;
    if (hash !== '#settings' && document.getElementById('nav-settings-tabs').style.display !== 'none') {
      document.getElementById('nav-main-tabs').style.display = 'flex';
      document.getElementById('nav-settings-tabs').style.display = 'none';
      document.querySelectorAll('.settings-sub').forEach(s => s.style.display = 'block');
    }
    const tabs = document.querySelectorAll('#nav-main-tabs .nav__tab');
    const sections = document.querySelectorAll('.tab-section');
    tabs.forEach((t) => t.classList.toggle('nav__tab--active', t.dataset.tab === hash));
    sections.forEach((s) => s.classList.toggle('tab-section--active', '#' + s.id.replace('-section', '') === hash));
    window.scrollTo(0, 0);
    if (hash === '#settings') Settings.load();
    if (hash === '#chat') Chat.open();
  },

  enterSettings() {
    document.getElementById('settings-nav').style.display = 'flex';
    document.getElementById('chat-section').style.display = 'none';
    document.getElementById('settings-section').classList.add('tab-section--active');
    document.getElementById('app-view').classList.add('app-view--settings');
    document.getElementById('main-content').classList.add('main--settings');
    this.showSettingsSection('settings-profile-section');
    document.querySelectorAll('#nav-settings-tabs .nav__tab').forEach(b => b.classList.remove('nav__tab--active'));
    document.querySelector('#nav-settings-tabs .nav__tab[data-settings-section="settings-profile-section"]').classList.add('nav__tab--active');
    Settings.load();
  },

  exitSettings() {
    document.getElementById('settings-nav').style.display = 'none';
    document.getElementById('chat-section').style.display = 'block';
    document.getElementById('settings-section').classList.remove('tab-section--active');
    document.getElementById('app-view').classList.remove('app-view--settings');
    document.getElementById('main-content').classList.remove('main--settings');
    Chat.open();
  },

  showSettingsSection(id) {
    document.querySelectorAll('.settings-sub').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'block';
  },
};

function confirmAction(message, title) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-title').textContent = title || 'Confirm';
    document.getElementById('confirm-modal-message').textContent = message;
    modal.classList.remove('modal-overlay--hidden');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    function cleanup() { modal.classList.add('modal-overlay--hidden'); okBtn.removeEventListener('click', onOk); cancelBtn.removeEventListener('click', onCancel); }
    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

let inactivityTimer;
function resetInactivity() {
  clearTimeout(inactivityTimer);
  const timeout = parseInt(localStorage.getItem('ehcta-autolock') || '300000');
  if (timeout === 0) return;
  inactivityTimer = setTimeout(() => {
    if (document.getElementById('app-view').style.display !== 'none') {
      Crypto.clear();
      sessionStorage.clear();
      Toast.show('Session locked due to inactivity');
      window.location.reload();
    }
  }, timeout);
}
document.addEventListener('mousemove', resetInactivity);
document.addEventListener('keydown', resetInactivity);
document.addEventListener('click', resetInactivity);

// Click outside modal to close
document.addEventListener('click', (e) => {
  const overlay = e.target.closest('.modal-overlay');
  if (!overlay) return;
  if (e.target === overlay) overlay.classList.add('modal-overlay--hidden');
});

document.addEventListener('DOMContentLoaded', () => App.init());
