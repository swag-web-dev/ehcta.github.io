// ── CHAT MODULE ──

(function() {
  const style = document.createElement('style');
  style.textContent = `
    .chat-msg-row {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      margin-bottom: 4px;
      position: relative;
    }
    .chat-msg-row--me { flex-direction: row-reverse; }
    .chat-msg-row--them { flex-direction: row; }
    .chat-msg {
      max-width: 70%;
      padding: 8px 12px;
      font-size: 0.85rem;
      line-height: 1.4;
      word-break: break-word;
    }
    .chat-msg--me {
      background: #1a1a1a;
      color: var(--color-text, #fff);
      border: var(--border, 1px solid #fff);
    }
    .chat-msg--them {
      background: var(--color-surface, #0a0a0a);
      color: var(--color-text, #fff);
      border: var(--border-muted, 1px solid #333);
    }
    [data-theme="light"] .chat-msg--me { background: #e8e8e8; color: #000; border-color: #000; }
    [data-theme="light"] .chat-msg--them { background: #f5f5f5; color: #000; }
    .chat-msg__footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 3px;
      gap: 8px;
    }
    .chat-msg__time { font-size: 0.6rem; opacity: 0.5; white-space: nowrap; }
    .chat-msg__dots {
      background: none; border: none;
      color: var(--color-text-muted, #888);
      font-size: 0.9rem; cursor: pointer; padding: 2px 4px; line-height: 1;
      opacity: 0;
      transition: opacity 0.15s;
      align-self: center;
      flex-shrink: 0;
    }
    .chat-msg-row:hover .chat-msg__dots { opacity: 1; }
    .chat-msg__dots:hover { color: var(--color-text, #fff); }
    .chat-msg__menu {
      position: fixed;
      z-index: 55;
      background: var(--color-bg, #000);
      border: var(--border, 1px solid #fff);
      min-width: 120px;
      padding: 4px 0;
    }
    .chat-msg__menu-item {
      display: block; width: 100%;
      background: none; border: none; color: var(--color-text, #fff);
      font-size: 0.75rem; padding: 6px 14px;
      cursor: pointer; text-align: left;
      font-family: var(--font-body, sans-serif);
    }
    .chat-msg__menu-item:hover { background: var(--color-surface-hover, rgba(255,255,255,0.08)); }
    .chat-msg__menu-item--danger { color: #e74c3c; }
    .chat-pin-item {
      padding: 10px; border-bottom: var(--border-muted, 1px solid #333);
      font-size: 0.8rem; line-height: 1.4;
    }
    .chat-pin-item:last-child { border-bottom: none; }
    .chat-pin-item__text { margin-bottom: 4px; word-break: break-word; }
    .chat-pin-item__meta {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 0.65rem; color: var(--color-text-muted, #888);
    }
    .chat-pin-item__unpin {
      background: none; border: none; color: var(--color-text-muted);
      font-size: 0.6rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .chat-pin-item__unpin:hover { color: #e74c3c; }
    .chat-edit-input {
      width: 100%; background: var(--color-input-bg, #111);
      border: var(--border-muted, 1px solid #333); color: var(--color-text, #fff);
      font-size: 0.85rem; padding: 6px 8px; margin-top: 6px; font-family: inherit;
    }
    .chat-edit-input:focus { outline: none; border-color: var(--color-accent, #fff); }
    .chat-edit-btns { display: flex; gap: 4px; margin-top: 4px; justify-content: flex-end; }
    .chat-conv-item {
      padding: 12px 16px; cursor: pointer;
      border-bottom: var(--border-muted, 1px solid #333); transition: background 0.15s;
    }
    .chat-conv-item:hover { background: var(--color-surface-hover, rgba(255,255,255,0.05)); }
    .chat-conv-item--active { background: var(--color-surface-hover, rgba(255,255,255,0.08)); }
    .chat-conv-item__name { font-weight: 500; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; }
    .chat-conv-item__uid { font-size: 0.7rem; color: var(--color-text-muted, #888); }
    .chat-conv-item__time { font-size: 0.65rem; color: var(--color-text-muted, #888); margin-top: 2px; }
    .chat-conv-item__unread {
      background: var(--color-accent, #fff); color: var(--color-bg, #000);
      font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: 10px; min-width: 18px; text-align: center;
    }
    .chat-conv-item__status {
      width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; flex-shrink: 0;
    }
    .chat-conv-item__status--online { background: #4aff7a; }
    .chat-conv-item__status--recent { background: #ff9f4a; }
    .chat-conv-item__status--offline { background: #666; }
    .chat-search-result {
      padding: 10px 16px; cursor: pointer;
      border-bottom: var(--border-muted, 1px solid #333); font-size: 0.8rem;
    }
    .chat-search-result:hover { background: var(--color-surface-hover, rgba(255,255,255,0.05)); }
    .chat-search-result__name { font-weight: 500; }
    .chat-search-result__uid { font-size: 0.7rem; color: var(--color-text-muted, #888); }
    .chat-search-result__no-keys { font-size: 0.65rem; color: var(--color-error, #e74c3c); }
    #chat-search-results {
      position: absolute; z-index: 10; left: 16px; right: 16px;
      background: var(--color-bg, #0f0f23); border: var(--border, 1px solid #444);
      max-height: 200px; overflow-y: auto;
    }
    .chat-day-sep {
      text-align: center; padding: 12px 0; font-size: 0.65rem; text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--color-text-muted, #888);
    }
    .chat-msg__quote {
      border-left: 2px solid var(--color-text-muted, #666); padding: 4px 8px;
      margin-bottom: 6px; font-size: 0.75rem; color: var(--color-text-muted, #888);
      max-height: 40px; overflow: hidden;
    }
    .chat-msg__attachment img {
      max-width: 100%; max-height: 300px; margin-top: 6px; cursor: pointer;
      border: var(--border-muted, 1px solid #333);
    }
    .chat-msg__attachment a {
      display: inline-block; margin-top: 6px; padding: 6px 10px;
      border: var(--border-muted, 1px solid #333); font-size: 0.75rem;
      color: var(--color-text, #fff); text-decoration: none;
    }
    .chat-msg__attachment a:hover { background: var(--color-surface-hover, rgba(255,255,255,0.05)); }
    .chat-attach-thumb {
      display: inline-block; margin: 4px; padding: 4px 8px;
      border: var(--border-muted); font-size: 0.75rem; position: relative;
    }
    .chat-attach-thumb__remove {
      position: absolute; top: -4px; right: -4px; background: var(--color-bg);
      border: var(--border-muted); color: var(--color-text-muted);
      width: 16px; height: 16px; font-size: 0.6rem; cursor: pointer; line-height: 16px; text-align: center;
    }
    .chat-conv-item__actions {
      display: none; gap: 4px; margin-top: 6px;
    }
    .chat-conv-item:hover .chat-conv-item__actions { display: flex; }
    .chat-lightbox {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.92); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
    }
    .chat-lightbox__img-wrap {
      position: relative;
      overflow: hidden;
      max-width: 92vw; max-height: 92vh;
      cursor: zoom-in;
    }
    .chat-lightbox__img-wrap--zoomed {
      cursor: grab;
      max-width: none; max-height: none;
      width: 92vw; height: 92vh;
    }
    .chat-lightbox__img-wrap--zoomed.dragging { cursor: grabbing; }
    .chat-lightbox__img-wrap img {
      display: block;
      max-width: 92vw; max-height: 92vh; object-fit: contain;
      transition: transform 0.2s ease;
      transform-origin: center center;
    }
    .chat-lightbox__img-wrap--zoomed img {
      max-width: none; max-height: none;
      width: auto; height: auto;
      position: absolute;
      transition: none;
    }
    .chat-lightbox__close {
      position: absolute; top: 16px; right: 24px;
      background: none; border: none; color: #fff; font-size: 2rem;
      cursor: pointer; z-index: 10000; line-height: 1;
    }
    .chat-lightbox__close:hover { color: #e74c3c; }
    .chat-scroll-area {
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: var(--color-text-muted, #666) var(--color-surface, #0a0a0a);
      -webkit-overflow-scrolling: touch;
    }
    .chat-scroll-area::-webkit-scrollbar { width: 6px; }
    .chat-scroll-area::-webkit-scrollbar-track { background: var(--color-surface, #0a0a0a); }
    .chat-scroll-area::-webkit-scrollbar-thumb { background: var(--color-text-muted, #666); }
    .chat-scroll-area::-webkit-scrollbar-thumb:hover { background: var(--color-text, #fff); }
    .chat-profile-tab {
      background: none; border: none; border-bottom: 2px solid transparent;
      color: var(--color-text-muted, #888); font-size: 0.85rem; font-family: var(--font-body, sans-serif);
      text-transform: uppercase; letter-spacing: 0.06em; padding: 14px 20px;
      cursor: pointer; white-space: nowrap;
    }
    .chat-profile-tab:hover { color: var(--color-text, #fff); }
    .chat-profile-tab--active {
      color: var(--color-text, #fff); border-bottom-color: var(--color-accent, #fff);
    }
  `;
  document.head.appendChild(style);
})();

// ── SMOOTH SCROLL FOR MOUSE WHEEL ──
(function() {
  const ease = 0.12;
  const targets = new WeakMap();

  function getState(el) {
    let s = targets.get(el);
    if (!s) { s = { current: el.scrollTop, target: el.scrollTop, rafId: 0 }; targets.set(el, s); }
    return s;
  }

  function animate(el) {
    const s = getState(el);
    s.current += (s.target - s.current) * ease;
    if (Math.abs(s.target - s.current) < 0.5) {
      s.current = s.target;
      el.scrollTop = s.current;
      s.rafId = 0;
      return;
    }
    el.scrollTop = s.current;
    s.rafId = requestAnimationFrame(() => animate(el));
  }

  document.addEventListener('wheel', (e) => {
    const el = e.target.closest('.chat-scroll-area');
    if (!el) return;
    e.preventDefault();
    const s = getState(el);
    s.current = el.scrollTop;
    s.target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, s.target + e.deltaY));
    if (!s.rafId) s.rafId = requestAnimationFrame(() => animate(el));
  }, { passive: false });
})();

// ── EMOJI DATA ──
const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','😍','😘','😗','😚','😙','😋','😛','😜','😝','🤑','🤗','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','😵','🤯','🤠','😎','🤓','😕','😟','🙁','😮','😯','😲','😳','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'Gestures': ['👋','🤚','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','👀','👁️','👅','👄'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💋','💍','💎'],
  'Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🐢','🐍','🐙','🦑','🦐','🦀','🐠','🐟','🐡','🐬','🐳','🐋'],
  'Food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🥝','🍅','🥑','🍆','🌶️','🌽','🥕','🥔','🍠','🍯','🍞','🧀','🍖','🍗','🥩','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🍿','🧂','🥤','🍺','🍻','🥂','🍷','🍸','🍹','🍾','☕','🍵','🧃'],
  'Objects': ['🔔','🎵','🎶','💬','💭','📱','💻','🖥️','📷','🎥','📞','📺','🔑','🔒','🔓','📎','✂️','📝','✏️','📁','📂','📅','📌','📍','🎮','🎲','🎭','🎨','🎤','🎧','🎹','🎸','🎺','🎷','🥁','🎬','📸','💡','🔦','📖','📚'],
  'Symbols': ['✅','❌','❓','❗','⭐','✨','🔥','💯','🎯','💥','💤','⏰','⏳','🔴','🟡','🟢','🔵','⚫','⚪','🔶','🔷','▶️','⏸️','⏹️','🔊','🔇','🔔','🔕','💲','🏆','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾','🏐','🎱'],
};

const Chat = {
  _conversations: [],
  _messages: {},
  _activeConvId: null,
  _activeConvMeta: null,
  _pollTimer: null,
  _searchTimer: null,
  _myUserId: null,
  _myPublicKey: null,
  _initialized: false,
  _editingMsgId: null,
  _lastStatus: null,
  _replyTo: null,
  _pendingFiles: [],
  _emojiOpen: false,
  _typingTimer: null,
  _lastTypingSent: 0,
  _activeTab: 'messages',
  _ws: null,
  _wsReconnectTimer: null,
  _loadingOlder: false,

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      const settingsData = await API.get('api/settings/get');
      if (settingsData && settingsData.user_id) this._myUserId = settingsData.user_id;

      const keys = await API.get('api/chat/keys/get');
      if (keys.chat_public_key && keys.chat_private_key_enc && keys.chat_private_key_iv) {
        this._myPublicKey = keys.chat_public_key;
        await Crypto.loadChatPrivateKey(keys.chat_private_key_enc, keys.chat_private_key_iv);
      } else {
        const kp = await Crypto.generateChatKeyPair();
        await API.post('api/chat/keys/save', {
          public_key: kp.publicKey, private_key_enc: kp.privateKeyEnc, private_key_iv: kp.privateKeyIv,
        });
        this._myPublicKey = kp.publicKey;
        Crypto._chatPrivateKey = kp._privateKey;
      }
    } catch (e) { console.error('Chat init error:', e); }

    // Search
    const searchInput = document.getElementById('chat-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.searchUsers(searchInput.value.trim()), 300);
      });
      searchInput.addEventListener('blur', () => {
        setTimeout(() => { const r = document.getElementById('chat-search-results'); if (r) r.style.display = 'none'; }, 200);
      });
    }

    // Send
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());

    const msgInput = document.getElementById('chat-message-input');
    if (msgInput) {
      msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
      });
      msgInput.addEventListener('input', () => this._sendTyping());
    }
    // Fallback: delegate Enter key on the input in case init runs early
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement && document.activeElement.id === 'chat-message-input') {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Attach
    const attachBtn = document.getElementById('chat-attach-btn');
    const fileInput = document.getElementById('chat-file-input');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this._handleFiles(e.target.files));
    }

    // Paste images/files
    const msgInputForPaste = document.getElementById('chat-message-input');
    if (msgInputForPaste) {
      msgInputForPaste.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
          if (item.kind === 'file') {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            if (file.size > 25 * 1024 * 1024) { Toast.show('File too large (max 25MB)', true); continue; }
            const reader = new FileReader();
            reader.onload = (ev) => {
              this._pendingFiles.push({ name: file.name, type: file.type, size: file.size, dataUrl: ev.target.result });
              this._updateAttachPreview();
            };
            reader.readAsDataURL(file);
          }
        }
      });
    }

    // Emoji
    const emojiBtn = document.getElementById('chat-emoji-btn');
    if (emojiBtn) emojiBtn.addEventListener('click', () => this._toggleEmoji());

    const msgContainer = document.getElementById('chat-messages');
    if (msgContainer) {
      // Forward wheel from wrapper to the scrollable container
      const wrap = msgContainer.parentElement;
      if (wrap) {
        wrap.addEventListener('wheel', (e) => {
          msgContainer.scrollTop += e.deltaY;
          e.preventDefault();
        }, { passive: false });
      }
      msgContainer.addEventListener('scroll', () => {
        if (this._openMenuId) this._closeMenu();
        if (this._pinPanelOpen) { this._pinPanelOpen = false; const p = document.getElementById('chat-pin-panel'); if (p) p.style.display = 'none'; }
        const btn = document.getElementById('chat-scroll-btn');
        if (!btn) return;
        const atBottom = msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight < 100;
        btn.style.display = atBottom ? 'none' : 'block';
        // Load older messages when scrolled near top
        if (msgContainer.scrollTop < 50 && !this._loadingOlder && this._activeConvId) {
          this._loadOlderMessages();
        }
      });
    }

    // Close menus on outside click
    document.addEventListener('mousedown', (e) => {
      if (this._openMenuId && !e.target.closest('.chat-msg__menu') && !e.target.closest('.chat-msg__dots')) {
        this._closeMenu();
      }
      if (this._emojiOpen && !e.target.closest('#chat-emoji-picker') && !e.target.closest('#chat-emoji-btn')) {
        this._closeEmoji();
      }
      if (this._pinPanelOpen && !e.target.closest('#chat-pin-panel') && !e.target.closest('#chat-pin-toggle')) {
        this.togglePinPanel();
      }
    });
  },

  async open() {
    await this.loadConversations();
    this._startPolling();
    this._connectWS();
    // Mark current conversation as read
    if (this._activeConvId) this._markRead(this._activeConvId);
  },

  // ── MOBILE ──
  showSidebar() {
    document.getElementById('chat-layout').classList.remove('chat-layout--conv-open');
    this._activeConvId = null;
  },

  showConvPanel() {
    document.getElementById('chat-layout').classList.add('chat-layout--conv-open');
  },

  // ── SEARCH ──
  async searchUsers(query) {
    const results = document.getElementById('chat-search-results');
    if (!results) return;
    if (!query) { results.style.display = 'none'; return; }
    try {
      const users = await API.get('api/chat/search?q=' + encodeURIComponent(query));
      if (!users || users.length === 0) {
        results.innerHTML = '<div style="padding:10px 16px;font-size:0.8rem;color:var(--color-text-muted);">No users found</div>';
      } else {
        results.innerHTML = users.map(u => `
          <div class="chat-search-result" onclick="Chat.startConversation('${this._esc(u.unique_id)}')">
            <div class="chat-search-result__name">${this._esc(u.display_name)}</div>
            <div class="chat-search-result__uid">@${this._esc(u.unique_id)}</div>
            ${!u.has_chat ? '<div class="chat-search-result__no-keys">No chat keys</div>' : ''}
          </div>
        `).join('');
      }
      results.style.display = 'block';
    } catch (e) { results.style.display = 'none'; }
  },

  // ── CONVERSATIONS ──
  async startConversation(uniqueId) {
    const results = document.getElementById('chat-search-results');
    if (results) results.style.display = 'none';
    const searchInput = document.getElementById('chat-search');
    if (searchInput) searchInput.value = '';
    try {
      console.log('[DEBUG] startConversation called with:', uniqueId);
      const data = await API.post('api/chat/conversations/start', { unique_id: uniqueId });
      console.log('[DEBUG] startConversation response:', JSON.stringify(data));
      this._activeConvId = data.conversation_id;
      this._activeConvMeta = {
        id: data.conversation_id, otherPublicKey: data.other_public_key,
        myPublicKey: data.my_public_key, user1_id: data.user1_id, user2_id: data.user2_id,
      };
      // Show UI immediately, load data in parallel
      this._showInputArea(true);
      this.showConvPanel();
      this._subscribeConversation(data.conversation_id);
      await Promise.all([
        this.loadConversations(),
        this.loadMessages(data.conversation_id),
        this._markRead(data.conversation_id),
      ]);
    } catch (e) { Toast.show(e.message || 'Failed to start conversation', true); }
  },

  async loadConversations() {
    try {
      const convs = await API.get('api/chat/conversations');
      this._conversations = convs || [];
      this.renderConversations();
    } catch (e) { console.error('Failed to load conversations:', e); }
  },

  // ── MESSAGES ──
  async loadMessages(convId) {
    if (!convId) return;
    if (this._editingMsgId) return;
    try {
      const response = await API.get('api/chat/messages?conversation_id=' + encodeURIComponent(convId));
      const msgs = response.messages || response;
      const newMessages = [];
      if (msgs && msgs.length > 0) {
        for (const msg of msgs) {
          try { msg._plaintext = await this._decryptMyMessage(msg, convId); }
          catch (e) { msg._plaintext = '[Decryption failed]'; }
          try { msg._decryptedAttachment = await this._decryptAttachment(msg); }
          catch (e) { msg._decryptedAttachment = ''; }
          msg._isMine = this._myUserId && msg.sender_id === this._myUserId;
          newMessages.push(msg);
        }
      }
      this._messages[convId] = newMessages;
      this.renderMessages(convId);
    } catch (e) { console.error('Failed to load messages:', e); }
  },

  async _decryptMyMessage(msg) {
    try { return await Crypto.decryptChatMessage(msg.ciphertext_user1); }
    catch (e1) {
      try { return await Crypto.decryptChatMessage(msg.ciphertext_user2); }
      catch (e2) { return '[Unable to decrypt]'; }
    }
  },

  async _decryptAttachment(msg) {
    if (!msg.attachment) return '';
    try {
      const parsed = JSON.parse(msg.attachment);
      if (parsed.att_ct1 && parsed.att_ct2) {
        try { return await Crypto.decryptChatMessage(parsed.att_ct1); }
        catch (e1) {
          try { return await Crypto.decryptChatMessage(parsed.att_ct2); }
          catch (e2) { return ''; }
        }
      }
      return msg.attachment;
    } catch (e) {
      return msg.attachment;
    }
  },

  async _amIUser1(user1_id) {
    if (this._myUserId) return this._myUserId === user1_id;
    try {
      const settings = await API.get('api/settings/get');
      this._myUserId = settings.user_id;
      return this._myUserId === user1_id;
    } catch (e) { return true; }
  },

  // ── SEND MESSAGE ──
  _sending: false,

  async sendMessage() {
    if (this._sending) return;
    const input = document.getElementById('chat-message-input');
    if (!input) return;
    const text = input.value.trim();
    const hasFiles = this._pendingFiles.length > 0;
    if ((!text && !hasFiles) || !this._activeConvId || !this._activeConvMeta) return;

    const meta = this._activeConvMeta;
    if (!meta.otherPublicKey || !this._myPublicKey) {
      Toast.show('Chat keys not ready', true); return;
    }

    this._sending = true;

    // Capture and clear input immediately
    const msgContent = text || (hasFiles ? '[attachment]' : '');
    const files = this._pendingFiles.slice();
    const replyTo = this._replyTo;
    input.value = '';
    this._pendingFiles = [];
    this._updateAttachPreview();
    this.cancelReply();

    // Build attachment data
    let attachment = '';
    if (files.length > 0) {
      attachment = JSON.stringify(files.map(f => ({ name: f.name, type: f.type, size: f.size, data: f.dataUrl })));
    }

    // Show optimistic message immediately
    const tempId = '_tmp_' + Date.now();
    if (!this._messages[this._activeConvId]) this._messages[this._activeConvId] = [];
    this._messages[this._activeConvId].push({
      id: tempId, conversation_id: this._activeConvId,
      sender_id: this._myUserId || '__me__', ciphertext_user1: '', ciphertext_user2: '',
      created_at: new Date().toISOString(), _plaintext: msgContent, _isMine: true,
      reply_to: replyTo ? replyTo.id : '', attachment: '', _decryptedAttachment: attachment,
    });
    this.renderMessages(this._activeConvId);
    this.scrollToBottom();

    try {
      const amUser1 = await this._amIUser1(meta.user1_id);
      const user1PubKey = amUser1 ? this._myPublicKey : meta.otherPublicKey;
      const user2PubKey = amUser1 ? meta.otherPublicKey : this._myPublicKey;

      const convId = this._activeConvId;
      const ciphertext_user1 = await Crypto.encryptForChat(msgContent, user1PubKey);
      const ciphertext_user2 = await Crypto.encryptForChat(msgContent, user2PubKey);

      // Encrypt attachment if present
      let encAttachment = '';
      if (attachment) {
        const att_ct1 = await Crypto.encryptForChat(attachment, user1PubKey);
        const att_ct2 = await Crypto.encryptForChat(attachment, user2PubKey);
        encAttachment = JSON.stringify({ att_ct1, att_ct2 });
      }

      // Include conversation TTL if set
      const conv = this._conversations.find(c => c.id === this._activeConvId);
      const ttl = conv ? (conv.default_ttl || 0) : 0;

      const result = await API.post('api/chat/messages/send', {
        conversation_id: this._activeConvId, ciphertext_user1, ciphertext_user2,
        reply_to: replyTo ? replyTo.id : '', attachment: encAttachment, ttl,
      });

      // Replace temp message with real one
      const msgs = this._messages[this._activeConvId];
      if (msgs) {
        const idx = msgs.findIndex(m => m.id === tempId);
        if (idx !== -1) {
          msgs[idx].id = result.id;
          msgs[idx].ciphertext_user1 = ciphertext_user1;
          msgs[idx].ciphertext_user2 = ciphertext_user2;
          msgs[idx].created_at = result.created_at;
        }
      }
      this._markRead(this._activeConvId);
    } catch (e) {
      // Remove temp message on failure
      const msgs = this._messages[this._activeConvId];
      if (msgs) {
        const idx = msgs.findIndex(m => m.id === tempId);
        if (idx !== -1) msgs.splice(idx, 1);
        this.renderMessages(this._activeConvId);
      }
      Toast.show(e.message || 'Failed to send', true);
    } finally {
      this._sending = false;
    }
  },

  // ── REPLY ──
  setReply(msgId) {
    const msgs = this._messages[this._activeConvId] || [];
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return;
    this._replyTo = { id: msgId, text: (msg._plaintext || '').slice(0, 80) };
    document.getElementById('chat-reply-preview').style.display = 'block';
    document.getElementById('chat-reply-text').textContent = this._replyTo.text;
    document.getElementById('chat-message-input').focus();
  },

  cancelReply() {
    this._replyTo = null;
    document.getElementById('chat-reply-preview').style.display = 'none';
  },

  // ── ATTACHMENTS ──
  _handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) { Toast.show('File too large (max 25MB): ' + file.name, true); continue; }
      const reader = new FileReader();
      reader.onload = (e) => {
        this._pendingFiles.push({ name: file.name, type: file.type, size: file.size, dataUrl: e.target.result });
        this._updateAttachPreview();
      };
      reader.readAsDataURL(file);
    }
    document.getElementById('chat-file-input').value = '';
  },

  _updateAttachPreview() {
    const el = document.getElementById('chat-attach-preview');
    if (!el) return;
    if (this._pendingFiles.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block';
    el.innerHTML = this._pendingFiles.map((f, i) =>
      `<span class="chat-attach-thumb">${this._esc(f.name)} (${this._formatSize(f.size)})<span class="chat-attach-thumb__remove" onclick="Chat._removeFile(${i})">&times;</span></span>`
    ).join('');
  },

  _removeFile(idx) {
    this._pendingFiles.splice(idx, 1);
    this._updateAttachPreview();
  },

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1024/1024).toFixed(1) + 'MB';
  },

  // ── EMOJI ──
  _toggleEmoji() {
    this._emojiOpen ? this._closeEmoji() : this._openEmoji();
  },

  _openEmoji() {
    this._emojiOpen = true;
    const picker = document.getElementById('chat-emoji-picker');
    if (!picker) return;
    const cats = Object.keys(EMOJI_CATEGORIES);
    let html = '<div class="emoji-picker"><div class="emoji-picker__tabs">';
    html += cats.map((c, i) => `<button class="emoji-picker__tab ${i===0?'emoji-picker__tab--active':''}" onclick="Chat._showEmojiCat(${i})">${EMOJI_CATEGORIES[c][0]}</button>`).join('');
    html += '</div><div class="emoji-picker__content chat-scroll-area">';
    cats.forEach((c, i) => {
      html += `<div class="emoji-picker__grid" id="emoji-cat-${i}" style="${i>0?'display:none':''}">`;
      html += EMOJI_CATEGORIES[c].map(e => `<button class="emoji-picker__item" onclick="Chat._insertEmoji('${e}')">${e}</button>`).join('');
      html += '</div>';
    });
    html += '</div></div>';
    picker.innerHTML = html;
    picker.style.display = 'block';

    // Enable scroll wheel on emoji content area
    const content = picker.querySelector('.emoji-picker__content');
    if (content) {
      content.addEventListener('wheel', (e) => {
        content.scrollTop += e.deltaY;
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
    }
  },

  _closeEmoji() {
    this._emojiOpen = false;
    const picker = document.getElementById('chat-emoji-picker');
    if (picker) { picker.style.display = 'none'; picker.innerHTML = ''; }
  },

  _showEmojiCat(idx) {
    const cats = Object.keys(EMOJI_CATEGORIES);
    cats.forEach((_, i) => {
      const el = document.getElementById('emoji-cat-' + i);
      if (el) el.style.display = i === idx ? 'grid' : 'none';
    });
    document.querySelectorAll('.emoji-picker__tab').forEach((t, i) => {
      t.classList.toggle('emoji-picker__tab--active', i === idx);
    });
  },

  _insertEmoji(emoji) {
    const input = document.getElementById('chat-message-input');
    if (input) {
      const start = input.selectionStart || input.value.length;
      input.value = input.value.slice(0, start) + emoji + input.value.slice(input.selectionEnd || start);
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    }
  },

  // ── TYPING ──
  _sendTyping() {
    if (!this._activeConvId) return;
    const now = Date.now();
    if (now - this._lastTypingSent < 2000) return;
    this._lastTypingSent = now;
    API.post('api/chat/typing', { conversation_id: this._activeConvId }).catch(() => {});
  },

  async _checkTyping() {
    if (!this._activeConvId) return;
    try {
      const data = await API.get('api/chat/typing?conversation_id=' + encodeURIComponent(this._activeConvId));
      const el = document.getElementById('chat-typing');
      if (el) el.style.display = data.typing ? 'block' : 'none';
    } catch (e) {}
  },

  // ── READ RECEIPTS ──
  async _markRead(convId) {
    try { await API.post('api/chat/read', { conversation_id: convId }); } catch (e) {}
  },

  // ── POLLING ──
  _convPollCount: 0,
  _lastConvJson: '',

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => {
      if (this._editingMsgId) return;
      if (this._activeConvId) {
        this._checkForChanges(this._activeConvId);
        this._checkTyping();
      }
      this._checkConversations();
    }, 2000);
  },

  async _checkConversations() {
    try {
      const convs = await API.get('api/chat/conversations');
      const json = JSON.stringify(convs.map(c => c.id + c.unread_count + c.last_message_at + c.status));
      if (json !== this._lastConvJson) {
        this._lastConvJson = json;
        this._conversations = convs || [];
        this.renderConversations();
      } else {
        // Update data without re-rendering (for last_seen changes etc)
        this._conversations = convs || [];
      }
    } catch (e) {}
  },

  async _checkForChanges(convId) {
    try {
      const status = await API.get('api/chat/messages/status?conversation_id=' + encodeURIComponent(convId));
      const changed = !this._lastStatus
        || status.count !== this._lastStatus.count
        || status.last_id !== this._lastStatus.last_id
        || status.last_ct1 !== this._lastStatus.last_ct1;
      this._lastStatus = status;
      if (changed) {
        await this.loadMessages(convId);
        this._markRead(convId);
        // Also refresh conversation list when messages change
        this._checkConversations();
      }
    } catch (e) {}
  },

  _stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },

  // ── WEBSOCKET ──
  async _connectWS() {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;
    try {
      const { token } = await API.post('api/ws/token', {});
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this._ws = new WebSocket(proto + '//' + location.host);
      this._ws.onopen = () => {
        this._ws.send(JSON.stringify({ type: 'auth', token }));
      };
      this._ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'auth_ok') {
            if (this._activeConvId) {
              this._subscribeConversation(this._activeConvId);
            }
          }
          if (msg.type === 'update' && msg.conversation_id) {
            if (msg.conversation_id === this._activeConvId) {
              this.loadMessages(this._activeConvId);
            }
            this._checkConversations();
          }
        } catch(err) {}
      };
      this._ws.onclose = () => {
        this._ws = null;
        clearTimeout(this._wsReconnectTimer);
        this._wsReconnectTimer = setTimeout(() => this._connectWS(), 3000);
      };
      this._ws.onerror = () => {};
    } catch(e) {}
  },

  _subscribeConversation(convId) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'subscribe', conversation_id: convId }));
    }
  },

  // ── KEY FINGERPRINT VERIFICATION ──
  async showFingerprint() {
    if (!this._activeConvMeta || !this._myPublicKey) return;
    const myFp = await Crypto.getKeyFingerprint(this._myPublicKey);
    const theirFp = await Crypto.getKeyFingerprint(this._activeConvMeta.otherPublicKey);
    const conv = this._conversations.find(c => c.id === this._activeConvId);
    const theirName = conv ? conv.other_user_name : 'Other';

    // Show fingerprint overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div style="background:var(--color-bg,#000);border:var(--border,1px solid #fff);padding:32px;max-width:420px;width:90%;">' +
      '<h3 style="font-family:var(--font-title);font-size:1.1rem;margin-bottom:16px;">Key Fingerprints</h3>' +
      '<p style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:16px;">Compare these numbers with ' + this._esc(theirName) + ' in person or over a trusted channel to verify end-to-end encryption.</p>' +
      '<div style="margin-bottom:16px;"><div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-text-muted);margin-bottom:4px;">Your key</div>' +
      '<code style="font-size:0.9rem;letter-spacing:0.15em;word-break:break-all;">' + this._esc(myFp) + '</code></div>' +
      '<div style="margin-bottom:20px;"><div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-text-muted);margin-bottom:4px;">' + this._esc(theirName) + '\'s key</div>' +
      '<code style="font-size:0.9rem;letter-spacing:0.15em;word-break:break-all;">' + this._esc(theirFp) + '</code></div>' +
      '<button class="btn btn--small" onclick="this.closest(\'div[style]\').parentElement.remove()">CLOSE</button>' +
      '</div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  },

  // ── MESSAGE PAGINATION ──
  async _loadOlderMessages() {
    if (!this._activeConvId || this._loadingOlder) return;
    const msgs = this._messages[this._activeConvId] || [];
    if (msgs.length === 0) return;
    const oldest = msgs[0];
    this._loadingOlder = true;
    try {
      const olderResp = await API.get('api/chat/messages?conversation_id=' + encodeURIComponent(this._activeConvId) + '&before=' + encodeURIComponent(oldest.created_at));
      const olderMsgs = olderResp.messages || olderResp;
      if (olderMsgs && olderMsgs.length > 0) {
        const decrypted = [];
        for (const msg of olderMsgs) {
          try { msg._plaintext = await this._decryptMyMessage(msg, this._activeConvId); }
          catch (e) { msg._plaintext = '[Decryption failed]'; }
          try { msg._decryptedAttachment = await this._decryptAttachment(msg); }
          catch (e) { msg._decryptedAttachment = ''; }
          msg._isMine = this._myUserId && msg.sender_id === this._myUserId;
          decrypted.push(msg);
        }
        const container = document.getElementById('chat-messages');
        const oldScrollHeight = container ? container.scrollHeight : 0;
        this._messages[this._activeConvId] = [...decrypted, ...msgs];
        this.renderMessages(this._activeConvId);
        if (container) container.scrollTop = container.scrollHeight - oldScrollHeight;
      }
    } catch(e) {}
    this._loadingOlder = false;
  },

  // ── SCROLL ──
  scrollToBottom(instant) {
    const c = document.getElementById('chat-messages');
    if (!c) return;
    if (instant) {
      c.scrollTop = c.scrollHeight;
    } else {
      c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    }
    const btn = document.getElementById('chat-scroll-btn');
    if (btn) btn.style.display = 'none';
  },

  // ── RENDER CONVERSATIONS ──
  _lastConvHtml: '',

  switchTab(tab) {
    this._activeTab = tab;
    this._lastConvHtml = '';
    this.renderConversations();
  },

  renderConversations() {
    const list = document.getElementById('chat-conv-list');
    if (!list) return;

    const requests = this._conversations.filter(c => c.is_request);
    const pending = this._conversations.filter(c => c.is_pending);
    const accepted = this._conversations.filter(c => c.status === 'accepted');
    const requestCount = requests.length;

    // Render tabs
    let tabsEl = document.getElementById('chat-sidebar-tabs');
    if (!tabsEl) {
      tabsEl = document.createElement('div');
      tabsEl.id = 'chat-sidebar-tabs';
      tabsEl.className = 'chat-sidebar-tabs';
      list.parentElement.insertBefore(tabsEl, list);
    }
    tabsEl.innerHTML = `<button class="chat-sidebar-tab ${this._activeTab === 'messages' ? 'chat-sidebar-tab--active' : ''}" onclick="Chat.switchTab('messages')">Messages</button><button class="chat-sidebar-tab ${this._activeTab === 'requests' ? 'chat-sidebar-tab--active' : ''}" onclick="Chat.switchTab('requests')">Requests${requestCount > 0 ? '<span class="chat-sidebar-tab__badge">' + requestCount + '</span>' : ''}</button>`;

    let html = '';

    if (this._activeTab === 'messages') {
      // Messages tab: accepted + pending (sent by me)
      if (pending.length > 0) {
        html += '<div style="padding:8px 16px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-text-muted);border-bottom:var(--border-muted);">Pending</div>';
        html += pending.map(c => this._renderConvItem(c, '#ff9f4a', 'Waiting for response')).join('');
      }

      if (accepted.length > 0) {
        html += accepted.map(c => this._renderConvItem(c)).join('');
      }

      if (pending.length === 0 && accepted.length === 0) {
        html = '<div style="padding:24px 16px;text-align:center;font-size:0.8rem;color:var(--color-text-muted);">No conversations yet.<br>Search for a user above.</div>';
      }
    } else {
      // Requests tab: incoming requests
      if (requests.length > 0) {
        html += requests.map(c => `
          <div class="chat-conv-item" style="background:rgba(255,255,255,0.03);" onclick="Chat._openRequest('${this._esc(c.id)}', '${this._esc(c.other_user_uid)}')">
            <div class="chat-conv-item__name">${this._esc(c.other_user_name || 'Unknown')}</div>
            <div class="chat-conv-item__uid">@${this._esc(c.other_user_uid || '???')}</div>
            <div style="display:flex;gap:4px;margin-top:8px;">
              <button class="btn btn--small btn--primary" style="font-size:0.65rem;padding:3px 8px;" onclick="event.stopPropagation();Chat.acceptRequest('${this._esc(c.id)}')">ACCEPT</button>
              <button class="btn btn--small" style="font-size:0.65rem;padding:3px 8px;" onclick="event.stopPropagation();Chat.denyRequest('${this._esc(c.id)}')">DENY</button>
              <button class="btn btn--small btn--danger" style="font-size:0.65rem;padding:3px 8px;" onclick="event.stopPropagation();Chat.blockUser('${this._esc(c.id)}')">BLOCK</button>
            </div>
          </div>
        `).join('');
      } else {
        html = '<div style="padding:24px 16px;text-align:center;font-size:0.8rem;color:var(--color-text-muted);">No message requests.</div>';
      }
    }

    // Only replace DOM if content actually changed
    if (html !== this._lastConvHtml) {
      this._lastConvHtml = html;
      list.innerHTML = html;
    }
  },

  _renderConvItem(c, timeColor, timeText) {
    const statusClass = this._getOnlineStatus(c.other_last_seen);
    const unread = c.unread_count > 0 ? `<span class="chat-conv-item__unread">${c.unread_count}</span>` : '';
    const time = timeText
      ? `<div class="chat-conv-item__time" style="color:${timeColor || 'inherit'};">${timeText}</div>`
      : `<div class="chat-conv-item__time">${this._formatTime(c.last_message_at)}</div>`;

    return `<div class="chat-conv-item ${c.id === this._activeConvId ? 'chat-conv-item--active' : ''}" onclick="Chat._openConversation('${this._esc(c.id)}', '${this._esc(c.other_user_uid)}')">
      <div class="chat-conv-item__name">
        <span><span class="chat-conv-item__status ${statusClass}"></span>${this._esc(c.other_user_name || 'Unknown')}</span>
        ${unread}
      </div>
      <div class="chat-conv-item__uid">@${this._esc(c.other_user_uid || '???')}</div>
      ${time}
      <div class="chat-conv-item__actions">
        <button class="chat-msg__action-btn" onclick="event.stopPropagation();Chat.hideConversation('${this._esc(c.id)}')">delete</button>
      </div>
    </div>`;
  },

  _getOnlineStatus(lastSeen) {
    if (!lastSeen) return 'chat-conv-item__status--offline';
    const diff = Date.now() - new Date(lastSeen).getTime();
    if (diff < 2 * 60 * 1000) return 'chat-conv-item__status--online';
    if (diff < 15 * 60 * 1000) return 'chat-conv-item__status--recent';
    return 'chat-conv-item__status--offline';
  },

  _getLastSeenText(lastSeen) {
    if (!lastSeen) return 'offline';
    const diff = Date.now() - new Date(lastSeen).getTime();
    if (diff < 2 * 60 * 1000) return 'online';
    if (diff < 60 * 1000) return 'just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  },

  // ── HIDE CONVERSATION ──
  async hideConversation(convId) {
    if (!await confirmAction('Remove this conversation from your list? The other person will still see it.', 'Delete Conversation')) return;
    try {
      await API.post('api/chat/conversations/hide', { conversation_id: convId });
      if (this._activeConvId === convId) {
        this._activeConvId = null;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-header-name').textContent = 'Select a conversation';
        document.getElementById('chat-header-status').textContent = '';
        this._showInputArea(false);
        this.showSidebar();
      }
      await this.loadConversations();
    } catch (e) { Toast.show(e.message || 'Failed', true); }
  },

  // ── OPEN CONVERSATIONS ──
  async _openRequest(convId, otherUid) {
    try {
      const data = await API.post('api/chat/conversations/start', { unique_id: otherUid });
      this._activeConvMeta = { id: data.conversation_id, otherPublicKey: data.other_public_key, myPublicKey: data.my_public_key, user1_id: data.user1_id, user2_id: data.user2_id };
      this._activeConvId = data.conversation_id;
      await this.loadMessages(data.conversation_id);
    } catch (e) { this._activeConvId = convId; }
    const conv = this._conversations.find(c => c.id === convId);
    this._showInputArea(false);
    if (conv) {
      document.getElementById('chat-header-name').innerHTML = this._esc(conv.other_user_name) + ' <span style="font-size:0.75rem;color:#ff9f4a;margin-left:8px;">Request - accept to reply</span>';
      document.getElementById('chat-header-status').textContent = '';
    }
    this.renderConversations();
    this.showConvPanel();
  },

  async acceptRequest(convId) {
    try {
      await API.post('api/chat/conversations/accept', { conversation_id: convId });
      Toast.show('Request accepted');
      this._activeTab = 'messages';
      await this.loadConversations();
      const conv = this._conversations.find(c => c.id === convId);
      if (conv) {
        await this._openConversation(convId, conv.other_user_uid);
        this._showInputArea(true);
      }
      this.renderConversations();
    } catch (e) { Toast.show('Failed: ' + e.message, true); }
  },

  async denyRequest(convId) {
    if (!await confirmAction('Deny this message request?', 'Deny')) return;
    try {
      await API.post('api/chat/conversations/deny', { conversation_id: convId });
      Toast.show('Request denied');
      if (this._activeConvId === convId) {
        this._activeConvId = null;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-header-name').textContent = 'Select a conversation';
        this._showInputArea(false);
      }
      await this.loadConversations();
    } catch (e) { Toast.show('Failed: ' + e.message, true); }
  },

  async blockUser(convId) {
    if (!await confirmAction('Block this user?', 'Block User')) return;
    try {
      await API.post('api/chat/conversations/block', { conversation_id: convId });
      Toast.show('User blocked');
      if (this._activeConvId === convId) {
        this._activeConvId = null;
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('chat-header-name').textContent = 'Select a conversation';
        this._showInputArea(false);
      }
      await this.loadConversations();
    } catch (e) { Toast.show('Failed: ' + e.message, true); }
  },

  async _openConversation(convId, otherUid) {
    this._lastStatus = null;
    this.showConvPanel();
    if (!this._activeConvMeta || this._activeConvMeta.id !== convId) {
      await this.startConversation(otherUid);
      return;
    }
    this._activeConvId = convId;
    const conv = this._conversations.find(c => c.id === convId);
    if (conv && conv.is_request) {
      this._showInputArea(false);
      document.getElementById('chat-header-name').innerHTML = this._esc(conv.other_user_name) + ' <span style="font-size:0.75rem;color:#ff9f4a;margin-left:8px;">Request</span>';
    } else {
      this._showInputArea(true);
    }
    if (conv) {
      document.getElementById('chat-header-status').textContent = this._getLastSeenText(conv.other_last_seen);
    }
    // Subscribe to WebSocket updates for this conversation
    this._subscribeConversation(convId);
    // Load messages and mark read in parallel
    await Promise.all([
      this.loadMessages(convId),
      this._markRead(convId),
    ]);
    this.renderConversations();
  },

  // ── RENDER MESSAGES ──
  renderMessages(convId) {
    const container = document.getElementById('chat-messages');
    if (!container || convId !== this._activeConvId) return;

    const conv = this._conversations.find(c => c.id === convId);
    if (conv) {
      const headerName = document.getElementById('chat-header-name');
      headerName.innerHTML = '<span style="cursor:pointer;" onclick="Chat.showUserProfile()">' + this._esc((conv.other_user_name || 'Unknown') + ' (@' + (conv.other_user_uid || '') + ')') + '</span>';
      document.getElementById('chat-header-status').textContent = this._getLastSeenText(conv.other_last_seen);
    }

    const msgs = this._messages[convId] || [];
    if (msgs.length === 0) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:0.85rem;">No messages yet. Say hello!</div>';
      return;
    }

    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    let html = '';
    let lastDate = '';

    for (const m of msgs) {
      // Day separator
      const msgDate = this._getDayLabel(m.created_at);
      if (msgDate !== lastDate) {
        html += `<div class="chat-day-sep">${msgDate}</div>`;
        lastDate = msgDate;
      }

      const isMine = m._isMine || (this._myUserId && m.sender_id === this._myUserId);
      const cls = isMine ? 'chat-msg chat-msg--me' : 'chat-msg chat-msg--them';
      const hasAttach = !!m.attachment;
      const rowCls = (isMine ? 'chat-msg-row chat-msg-row--me' : 'chat-msg-row chat-msg-row--them') + (hasAttach ? ' chat-msg-row--has-attach' : '');
      const text = m._plaintext || '[Unable to decrypt]';

      // Reply quote
      let quoteHtml = '';
      if (m.reply_to) {
        const replyMsg = msgs.find(rm => rm.id === m.reply_to);
        if (replyMsg) {
          quoteHtml = `<div class="chat-msg__quote">${this._esc((replyMsg._plaintext || '').slice(0, 80))}</div>`;
        }
      }

      // Attachment
      let attachHtml = '';
      const attachData = m._decryptedAttachment || m.attachment || '';
      if (attachData) {
        try {
          const files = JSON.parse(attachData);
          for (const f of files) {
            if (f.type && f.type.startsWith('image/')) {
              attachHtml += `<div class="chat-msg__attachment"><img src="${this._esc(f.data)}" alt="${this._esc(f.name)}" onclick="Chat._openLightbox(this.src)"></div>`;
            } else {
              attachHtml += `<div class="chat-msg__attachment"><a href="${this._esc(f.data)}" download="${this._esc(f.name)}">${this._esc(f.name)} (${this._formatSize(f.size)})</a></div>`;
            }
          }
        } catch (e) {}
      }

      const dotsBtn = `<button class="chat-msg__dots" onclick="event.stopPropagation();Chat._toggleMenu('${this._esc(m.id)}')">&#8942;</button>`;
      const footer = `<div class="chat-msg__footer"><span class="chat-msg__time">${this._formatTimeShort(m.created_at)}</span>${dotsBtn}</div>`;

      html += `<div class="${rowCls}" data-msg-id="${this._esc(m.id)}">
        <div class="${cls}">
          ${quoteHtml}
          <div class="chat-msg__text">${text !== '[attachment]' ? this._esc(text) : ''}</div>
          ${attachHtml}
          ${footer}
        </div>
      </div>`;
    }

    // Disappearing messages notification
    if (conv && conv.default_ttl > 0) {
      html += '<div style="text-align:center;padding:12px 0;"><span style="display:inline-block;padding:6px 16px;font-size:0.7rem;color:var(--color-text-muted);border:var(--border-muted);letter-spacing:0.06em;">&#9201; Disappearing messages are on &middot; Messages delete after 24 hours</span></div>';
    }

    container.innerHTML = html;
    if (wasAtBottom) this.scrollToBottom(true);
  },

  _getDayLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today - msgDay) / (1000 * 60 * 60 * 24);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  },

  _showInputArea(show) {
    const area = document.getElementById('chat-input-area');
    if (area) area.style.display = show ? 'block' : 'none';
    const pinBtn = document.getElementById('chat-pin-toggle');
    if (pinBtn) pinBtn.style.display = show ? 'inline' : 'none';
  },

  _formatTime(iso) {
    if (!iso) return '';
    try { if (typeof Settings !== 'undefined' && Settings.formatDate) return Settings.formatDate(iso); } catch (e) {}
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  _formatTimeShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  _esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; },

  // ── EDIT/UNSEND ──
  async unsendMessage(msgId) {
    if (!this._activeConvId) return;
    try {
      await API.post('api/chat/messages/delete', { message_id: msgId });
      const msgs = this._messages[this._activeConvId];
      if (msgs) { const idx = msgs.findIndex(m => m.id === msgId); if (idx !== -1) msgs.splice(idx, 1); }
      this.renderMessages(this._activeConvId);
    } catch (e) { Toast.show(e.message || 'Failed to unsend', true); }
  },

  // ── 3-DOT MENU ──
  _openMenuId: null,

  _toggleMenu(msgId) {
    if (this._openMenuId === msgId) { this._closeMenu(); return; }
    this._closeMenu();
    this._openMenuId = msgId;
    const row = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!row) return;
    const dotsBtn = row.querySelector('.chat-msg__dots');
    const msgs = this._messages[this._activeConvId] || [];
    const msg = msgs.find(m => m.id === msgId);
    const isMine = msg && (msg._isMine || (this._myUserId && msg.sender_id === this._myUserId));

    const attachStr = msg ? (msg._decryptedAttachment || msg.attachment || '') : '';
    const hasAttach = attachStr.length > 2;

    let menuHtml = '<div class="chat-msg__menu">';
    menuHtml += `<button class="chat-msg__menu-item" onclick="Chat.setReply('${this._esc(msgId)}');Chat._closeMenu()">Reply</button>`;
    menuHtml += `<button class="chat-msg__menu-item" onclick="Chat.pinMessage('${this._esc(msgId)}');Chat._closeMenu()">Pin</button>`;
    if (hasAttach) {
      menuHtml += `<button class="chat-msg__menu-item" onclick="Chat._downloadAttachment('${this._esc(msgId)}');Chat._closeMenu()">Download</button>`;
    }
    if (isMine) {
      menuHtml += `<button class="chat-msg__menu-item" onclick="Chat.startEdit('${this._esc(msgId)}');Chat._closeMenu()">Edit</button>`;
      menuHtml += `<button class="chat-msg__menu-item chat-msg__menu-item--danger" onclick="Chat.unsendMessage('${this._esc(msgId)}');Chat._closeMenu()">Unsend</button>`;
    }
    menuHtml += '</div>';

    const menuEl = document.createElement('div');
    menuEl.innerHTML = menuHtml;
    const menu = menuEl.firstElementChild;
    document.body.appendChild(menu);

    // Position: to the left of the dots, clamped inside chat area
    requestAnimationFrame(() => {
      const dotsRect = dotsBtn ? dotsBtn.getBoundingClientRect() : row.getBoundingClientRect();
      const chatArea = document.getElementById('chat-messages');
      const chatRect = chatArea ? chatArea.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
      const menuH = menu.offsetHeight;
      const menuW = menu.offsetWidth;

      // Left of the dots
      let left = dotsRect.left - menuW - 4;
      if (left < chatRect.left) left = dotsRect.right + 4;

      // Top aligned with dots
      let top = dotsRect.top;
      // If menu goes below chat area, push it up
      if (top + menuH > chatRect.bottom) {
        top = dotsRect.bottom - menuH;
      }
      // Don't go above chat area
      if (top < chatRect.top) top = chatRect.top;

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    });
  },

  _closeMenu() {
    this._openMenuId = null;
    document.querySelectorAll('.chat-msg__menu').forEach(el => el.remove());
  },

  // ── PIN ──
  _pinPanelOpen: false,

  async pinMessage(msgId) {
    try {
      await API.post('api/chat/messages/pin', { message_id: msgId });
      Toast.show('Message pinned');
    } catch (e) { Toast.show(e.message || 'Failed to pin', true); }
  },

  async unpinMessage(msgId) {
    try {
      await API.post('api/chat/messages/unpin', { message_id: msgId });
      Toast.show('Message unpinned');
      if (this._pinPanelOpen) this._loadPins();
    } catch (e) { Toast.show(e.message || 'Failed to unpin', true); }
  },

  togglePinPanel() {
    this._pinPanelOpen = !this._pinPanelOpen;
    this._closeTtlMenu();
    const panel = document.getElementById('chat-pin-panel');
    if (!panel) return;
    if (this._pinPanelOpen) {
      panel.style.display = 'flex';
      this._loadPins();
    } else {
      panel.style.display = 'none';
    }
  },

  // ── USER PROFILE POPUP ──
  _profileOpen: false,

  showUserProfile() {
    if (this._profileOpen) { this.closeUserProfile(); return; }
    const conv = this._conversations.find(c => c.id === this._activeConvId);
    if (!conv) return;
    this._profileOpen = true;
    this._profileTab = null;

    const currentTtl = conv.default_ttl || 0;
    const ttlOn = currentTtl > 0;
    const statusClass = this._getOnlineStatus(conv.other_last_seen);
    const statusText = this._getLastSeenText(conv.other_last_seen);

    const overlay = document.createElement('div');
    overlay.id = 'chat-profile-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';

    const popup = document.createElement('div');
    popup.style.cssText = 'background:var(--color-bg,#000);border:var(--border,1px solid #fff);width:480px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;';

    popup.innerHTML = `
      <div style="padding:20px 24px;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:1.3rem;font-weight:500;font-family:var(--font-title);">${this._esc(conv.other_user_name || 'Unknown')}</div>
          <div style="font-size:0.8rem;color:var(--color-text-muted);margin-top:2px;">@${this._esc(conv.other_user_uid || '')}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
            <span class="chat-conv-item__status ${statusClass}"></span>
            <span style="font-size:0.75rem;color:var(--color-text-muted);">${this._esc(statusText)}</span>
          </div>
        </div>
        <button onclick="Chat.closeUserProfile()" style="background:none;border:none;color:var(--color-text-muted);cursor:pointer;font-size:1.4rem;line-height:1;">&times;</button>
      </div>
      <div style="border-top:var(--border-muted);display:flex;overflow-x:auto;flex-shrink:0;" id="chat-profile-tabs">
        <button class="chat-profile-tab" onclick="Chat._switchProfileTab('photos')">Photos</button>
        <button class="chat-profile-tab" onclick="Chat._switchProfileTab('links')">Links</button>
        <button class="chat-profile-tab" onclick="Chat._switchProfileTab('numbers')">Numbers</button>
        <button class="chat-profile-tab" onclick="Chat._switchProfileTab('files')">Files</button>
        <button class="chat-profile-tab" onclick="Chat._switchProfileTab('search')" style="margin-left:auto;" title="Search messages">&#128269;</button>
      </div>
      <div id="chat-profile-content" class="chat-scroll-area" style="flex:1;padding:16px 24px;min-height:200px;"></div>
      <div style="border-top:var(--border-muted);padding:12px 24px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <div>
          <div style="font-size:0.8rem;font-weight:500;">Disappearing Messages</div>
          <div style="font-size:0.65rem;color:var(--color-text-muted);margin-top:1px;">Auto-delete after 24h</div>
        </div>
        <div class="toggle ${ttlOn ? 'toggle--active' : ''}" onclick="Chat.toggleDisappearing()" style="cursor:pointer;">
          <div class="toggle__knob"></div>
        </div>
      </div>
    `;

    overlay.appendChild(popup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeUserProfile();
    });
    document.body.appendChild(overlay);

    // Default to photos tab
    this._switchProfileTab('photos');
  },

  closeUserProfile() {
    this._profileOpen = false;
    this._profileTab = null;
    const overlay = document.getElementById('chat-profile-overlay');
    if (overlay) overlay.remove();
  },

  _switchProfileTab(tab) {
    this._profileTab = tab;
    // Update tab active states
    const tabs = document.querySelectorAll('.chat-profile-tab');
    tabs.forEach(t => t.classList.remove('chat-profile-tab--active'));
    const tabNames = ['photos', 'links', 'numbers', 'files', 'search'];
    const idx = tabNames.indexOf(tab);
    if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('chat-profile-tab--active');

    if (tab === 'search') {
      this._showProfileSearch();
    } else {
      this._showSharedContent(tab);
    }
  },

  _showProfileSearch() {
    const container = document.getElementById('chat-profile-content');
    if (!container) return;
    container.innerHTML = `
      <div style="margin-bottom:12px;">
        <input type="text" id="chat-profile-search-input" class="input" placeholder="Search messages..." autocomplete="off" style="width:100%;font-size:0.85rem;">
      </div>
      <div id="chat-profile-search-results" style="font-size:0.85rem;"></div>
    `;
    const input = document.getElementById('chat-profile-search-input');
    input.focus();
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      this._runProfileSearch(q);
    });
  },

  _runProfileSearch(query) {
    const resultsEl = document.getElementById('chat-profile-search-results');
    if (!resultsEl) return;
    if (!query) { resultsEl.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:24px 0;">Type to search messages</div>'; return; }
    const msgs = this._messages[this._activeConvId] || [];
    const matches = msgs.filter(m => (m._plaintext || '').toLowerCase().includes(query));
    if (matches.length === 0) {
      resultsEl.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:24px 0;">No messages found</div>';
      return;
    }
    let html = `<div style="font-size:0.7rem;color:var(--color-text-muted);margin-bottom:8px;">${matches.length} result${matches.length !== 1 ? 's' : ''}</div>`;
    for (const m of matches) {
      const text = m._plaintext || '';
      const isMine = m._isMine || (this._myUserId && m.sender_id === this._myUserId);
      const time = this._formatTime(m.created_at);
      // Highlight matching text
      const escaped = this._esc(text);
      const escapedQuery = this._esc(query);
      const highlighted = escaped.replace(new RegExp('(' + escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark style="background:var(--color-accent);color:var(--color-bg);padding:0 2px;">$1</mark>');
      html += `<div style="padding:10px 0;border-bottom:var(--border-muted);cursor:pointer;" onclick="Chat.closeUserProfile();Chat._scrollToMsg('${this._esc(m.id)}')">
        <div style="font-size:0.65rem;color:var(--color-text-muted);margin-bottom:3px;">${isMine ? 'You' : this._esc(this._conversations.find(c => c.id === this._activeConvId)?.other_user_name || 'Them')} &middot; ${time}</div>
        <div style="line-height:1.4;">${highlighted}</div>
      </div>`;
    }
    resultsEl.innerHTML = html;
  },

  _scrollToMsg(msgId) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const el = container.querySelector('[data-msg-id="' + msgId + '"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = 'rgba(255,255,255,0.1)';
      setTimeout(() => el.style.background = '', 1500);
    }
  },

  _msgSender(m) {
    const isMine = m._isMine || (this._myUserId && m.sender_id === this._myUserId);
    if (isMine) return 'You';
    const conv = this._conversations.find(c => c.id === this._activeConvId);
    return conv ? (conv.other_user_name || 'Unknown') : 'Them';
  },

  _showSharedContent(type) {
    const container = document.getElementById('chat-profile-content');
    if (!container) return;
    const msgs = this._messages[this._activeConvId] || [];
    let html = '';
    const urlRegex = /(https?:\/\/[^\s<]+)/gi;
    const phoneRegex = /(\+?\d[\d\s\-()]{6,}\d)/g;
    const senderMeta = (m) => `<div style="font-size:0.65rem;color:var(--color-text-muted);margin-bottom:3px;">${this._esc(this._msgSender(m))} &middot; ${this._formatTimeShort(m.created_at)}</div>`;

    if (type === 'photos') {
      let items = '';
      for (const m of msgs) {
        const att = m._decryptedAttachment || m.attachment || '';
        if (att.length <= 2) continue;
        try {
          const files = JSON.parse(att);
          for (const f of files) {
            if (f.type && f.type.startsWith('image/')) {
              const sender = this._esc(this._msgSender(m));
              items += `<div style="overflow:hidden;border:var(--border-muted);cursor:pointer;" onclick="Chat._openLightbox(this.querySelector('img').src)"><img src="${this._esc(f.data)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;" alt="${this._esc(f.name)}"><div style="padding:4px 6px;font-size:0.6rem;color:var(--color-text-muted);background:var(--color-surface,#0a0a0a);">${sender}</div></div>`;
            }
          }
        } catch(e) {}
      }
      if (items) {
        html = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${items}</div>`;
      }
    } else if (type === 'files') {
      for (const m of msgs) {
        const att = m._decryptedAttachment || m.attachment || '';
        if (att.length <= 2) continue;
        try {
          const files = JSON.parse(att);
          for (const f of files) {
            if (!f.type || !f.type.startsWith('image/')) {
              html += `<div style="padding:10px 0;border-bottom:var(--border-muted);">${senderMeta(m)}<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${this._esc(f.name)}</div><a href="${this._esc(f.data)}" download="${this._esc(f.name)}" style="color:var(--color-text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;text-decoration:none;flex-shrink:0;margin-left:12px;">${this._formatSize(f.size)}</a></div></div>`;
            }
          }
        } catch(e) {}
      }
    } else if (type === 'links') {
      const seen = new Set();
      for (const m of msgs) {
        const text = m._plaintext || '';
        const links = text.match(urlRegex);
        if (links) {
          for (const link of links) {
            if (seen.has(link)) continue;
            seen.add(link);
            html += `<div style="padding:10px 0;border-bottom:var(--border-muted);">${senderMeta(m)}<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><a href="${this._esc(link)}" target="_blank" rel="noopener" style="color:var(--color-text);font-size:0.85rem;">${this._esc(link)}</a></div></div>`;
          }
        }
      }
    } else if (type === 'numbers') {
      const seen = new Set();
      for (const m of msgs) {
        const text = m._plaintext || '';
        const phones = text.match(phoneRegex);
        if (phones) {
          for (const phone of phones) {
            const clean = phone.trim();
            if (seen.has(clean)) continue;
            seen.add(clean);
            html += `<div style="padding:10px 0;border-bottom:var(--border-muted);">${senderMeta(m)}<div style="font-size:0.9rem;">${this._esc(clean)}</div></div>`;
          }
        }
      }
    }

    container.innerHTML = html || '<div style="padding:40px 0;text-align:center;font-size:0.85rem;color:var(--color-text-muted);">None found</div>';
  },

  // ── DISAPPEARING MESSAGES ──
  async toggleDisappearing() {
    if (!this._activeConvId) return;
    const conv = this._conversations.find(c => c.id === this._activeConvId);
    const currentTtl = conv ? (conv.default_ttl || 0) : 0;
    const newTtl = currentTtl > 0 ? 0 : 86400; // toggle between off and 24 hours
    try {
      await API.post('api/chat/conversations/ttl', { conversation_id: this._activeConvId, ttl: newTtl });
      if (conv) conv.default_ttl = newTtl;
      Toast.show(newTtl > 0 ? 'Disappearing messages enabled (24 hours)' : 'Disappearing messages disabled');
      this.closeUserProfile();
      this.renderMessages(this._activeConvId);
    } catch (e) { Toast.show(e.message || 'Failed', true); }
  },

  async _loadPins() {
    if (!this._activeConvId) return;
    const list = document.getElementById('chat-pin-list');
    if (!list) return;
    try {
      const pins = await API.get('api/chat/messages/pinned?conversation_id=' + encodeURIComponent(this._activeConvId));
      if (!pins || pins.length === 0) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--color-text-muted);font-size:0.8rem;">No pinned messages yet.</div>';
        return;
      }
      let html = '';
      for (const p of pins) {
        let text;
        try { text = await this._decryptMyMessage(p); }
        catch (e) { text = '[Unable to decrypt]'; }
        html += `<div class="chat-pin-item">
          <div class="chat-pin-item__text">${this._esc(text)}</div>
          <div class="chat-pin-item__meta">
            <span>${this._formatTimeShort(p.created_at)}</span>
            <button class="chat-pin-item__unpin" onclick="Chat.unpinMessage('${this._esc(p.id)}')">unpin</button>
          </div>
        </div>`;
      }
      list.innerHTML = html;
    } catch (e) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:0.8rem;">Failed to load pins.</div>';
    }
  },

  // ── EDIT ──
  startEdit(msgId) {
    if (!this._activeConvId) return;
    const msgs = this._messages[this._activeConvId];
    const msg = msgs ? msgs.find(m => m.id === msgId) : null;
    if (!msg) return;
    this._editingMsgId = msgId;
    const row = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!row) return;
    const el = row.querySelector('.chat-msg');
    if (!el) return;
    const textEl = el.querySelector('.chat-msg__text');
    const currentText = msg._plaintext || '';
    textEl.innerHTML = `<input type="text" class="chat-edit-input" id="chat-edit-input" value="${this._esc(currentText).replace(/"/g, '&quot;')}" autocomplete="off">
      <div class="chat-edit-btns">
        <button class="chat-msg__action-btn" onclick="Chat.cancelEdit()" style="font-size:0.65rem;background:none;border:none;color:var(--color-text-muted);cursor:pointer;">cancel</button>
        <button class="chat-msg__action-btn" onclick="Chat.submitEdit('${this._esc(msgId)}')" style="font-size:0.65rem;background:none;border:none;color:var(--color-text-muted);cursor:pointer;">save</button>
      </div>`;
    const input = document.getElementById('chat-edit-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.submitEdit(msgId); }
        if (e.key === 'Escape') this.cancelEdit();
      });
    }
  },

  cancelEdit() { this._editingMsgId = null; this.renderMessages(this._activeConvId); },

  async submitEdit(msgId) {
    const input = document.getElementById('chat-edit-input');
    if (!input) return;
    const newText = input.value.trim();
    if (!newText) return;
    const meta = this._activeConvMeta;
    if (!meta || !meta.otherPublicKey || !this._myPublicKey) { Toast.show('Cannot edit', true); return; }
    try {
      const amUser1 = await this._amIUser1(meta.user1_id);
      const u1k = amUser1 ? this._myPublicKey : meta.otherPublicKey;
      const u2k = amUser1 ? meta.otherPublicKey : this._myPublicKey;
      const convId = this._activeConvId;
      const ct1 = await Crypto.encryptForChat(newText, u1k);
      const ct2 = await Crypto.encryptForChat(newText, u2k);
      await API.post('api/chat/messages/edit', { message_id: msgId, ciphertext_user1: ct1, ciphertext_user2: ct2 });
      const msgs = this._messages[this._activeConvId];
      if (msgs) { const msg = msgs.find(m => m.id === msgId); if (msg) { msg._plaintext = newText; msg.ciphertext_user1 = ct1; msg.ciphertext_user2 = ct2; } }
      this._editingMsgId = null;
      this.renderMessages(this._activeConvId);
    } catch (e) { Toast.show(e.message || 'Failed to edit', true); }
  },

  // ── LIGHTBOX ──
  _openLightbox(src) {
    const overlay = document.createElement('div');
    overlay.className = 'chat-lightbox';

    const wrap = document.createElement('div');
    wrap.className = 'chat-lightbox__img-wrap';

    const img = document.createElement('img');
    img.src = src;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'chat-lightbox__close';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = '&times;';

    wrap.appendChild(img);
    overlay.appendChild(closeBtn);
    overlay.appendChild(wrap);

    let zoomed = false;
    let dragging = false;
    let didDrag = false;
    let startX = 0, startY = 0, scrollX = 0, scrollY = 0;

    const closeLightbox = () => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    // Close on overlay background or close button
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === closeBtn) closeLightbox();
    });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    // Click image to zoom in, double-click to zoom out
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (didDrag) { didDrag = false; return; } // ignore click after drag
      if (!zoomed) {
        // Zoom in
        zoomed = true;
        wrap.classList.add('chat-lightbox__img-wrap--zoomed');
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        img.style.width = natW + 'px';
        img.style.height = natH + 'px';
        img.style.left = ((wrap.clientWidth - natW) / 2) + 'px';
        img.style.top = ((wrap.clientHeight - natH) / 2) + 'px';
      }
    });

    img.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (zoomed) {
        zoomed = false;
        wrap.classList.remove('chat-lightbox__img-wrap--zoomed');
        img.style.left = '';
        img.style.top = '';
        img.style.width = '';
        img.style.height = '';
      }
    });

    // Drag to pan when zoomed
    wrap.addEventListener('mousedown', (e) => {
      if (!zoomed || e.target === closeBtn) return;
      e.preventDefault();
      dragging = true;
      didDrag = false;
      wrap.classList.add('dragging');
      startX = e.clientX;
      startY = e.clientY;
      scrollX = parseInt(img.style.left || 0);
      scrollY = parseInt(img.style.top || 0);
    });

    function onMouseMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      img.style.left = (scrollX + dx) + 'px';
      img.style.top = (scrollY + dy) + 'px';
    }

    function onMouseUp() {
      dragging = false;
      wrap.classList.remove('dragging');
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    function keyHandler(e) {
      if (e.key === 'Escape') closeLightbox();
    }
    document.addEventListener('keydown', keyHandler);

    document.body.appendChild(overlay);
  },

  // ── DOWNLOAD ATTACHMENT ──
  _downloadAttachment(msgId) {
    const msgs = this._messages[this._activeConvId] || [];
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return;
    const attachData = msg._decryptedAttachment || msg.attachment || '';
    if (!attachData) return;
    try {
      const files = JSON.parse(attachData);
      for (const f of files) {
        const a = document.createElement('a');
        a.href = f.data;
        a.download = f.name || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) { Toast.show('Failed to download attachment', true); }
  },

  destroy() {
    this._stopPolling();
    this._conversations = [];
    this._messages = {};
    this._activeConvId = null;
    this._activeConvMeta = null;
    this._myUserId = null;
    this._myPublicKey = null;
    this._initialized = false;
    this._editingMsgId = null;
    this._lastStatus = null;
    this._replyTo = null;
    this._pendingFiles = [];
    this._emojiOpen = false;
  },
};
