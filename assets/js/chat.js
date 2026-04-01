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
      position: absolute;
      z-index: 55;
      background: var(--color-bg, #000);
      border: var(--border, 1px solid #fff);
      min-width: 120px;
      padding: 4px 0;
      bottom: 100%;
      margin-bottom: 4px;
    }
    .chat-msg-row--me .chat-msg__menu { right: 0; }
    .chat-msg-row--them .chat-msg__menu { left: 0; }
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
  `;
  document.head.appendChild(style);
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

    // Emoji
    const emojiBtn = document.getElementById('chat-emoji-btn');
    if (emojiBtn) emojiBtn.addEventListener('click', () => this._toggleEmoji());

    // Smooth scroll helper
    function smoothWheel(el) {
      let target = el.scrollTop;
      let animating = false;
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target + e.deltaY));
        if (!animating) {
          animating = true;
          (function step() {
            const diff = target - el.scrollTop;
            if (Math.abs(diff) < 1) { el.scrollTop = target; animating = false; return; }
            el.scrollTop += diff * 0.25;
            requestAnimationFrame(step);
          })();
        }
      }, { passive: false });
      // Keep target in sync if user scrolls another way
      el.addEventListener('scroll', () => { if (!animating) target = el.scrollTop; });
    }

    const msgContainer = document.getElementById('chat-messages');
    const msgWrap = msgContainer ? msgContainer.parentElement : null;
    if (msgWrap) {
      msgWrap.addEventListener('wheel', (e) => { e.preventDefault(); msgContainer.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });
    }
    if (msgContainer) {
      smoothWheel(msgContainer);
      msgContainer.addEventListener('scroll', () => {
        const btn = document.getElementById('chat-scroll-btn');
        if (!btn) return;
        const atBottom = msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight < 100;
        btn.style.display = atBottom ? 'none' : 'block';
      });
    }

    const convList = document.getElementById('chat-conv-list');
    if (convList) smoothWheel(convList);

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
      const data = await API.post('api/chat/conversations/start', { unique_id: uniqueId });
      this._activeConvId = data.conversation_id;
      this._activeConvMeta = {
        id: data.conversation_id, otherPublicKey: data.other_public_key,
        myPublicKey: data.my_public_key, user1_id: data.user1_id, user2_id: data.user2_id,
      };
      // Show UI immediately, load data in parallel
      this._showInputArea(true);
      this.showConvPanel();
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
      const msgs = await API.get('api/chat/messages?conversation_id=' + encodeURIComponent(convId));
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
      // Encrypted attachment format: { att_ct1, att_ct2 }
      if (parsed.att_ct1 && parsed.att_ct2) {
        try { return await Crypto.decryptChatMessage(parsed.att_ct1); }
        catch (e1) {
          try { return await Crypto.decryptChatMessage(parsed.att_ct2); }
          catch (e2) { return ''; }
        }
      }
      // Legacy unencrypted attachment (plain array), return as-is
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

    try {
      const amUser1 = await this._amIUser1(meta.user1_id);
      const user1PubKey = amUser1 ? this._myPublicKey : meta.otherPublicKey;
      const user2PubKey = amUser1 ? meta.otherPublicKey : this._myPublicKey;

      const ciphertext_user1 = await Crypto.encryptForChat(msgContent, user1PubKey);
      const ciphertext_user2 = await Crypto.encryptForChat(msgContent, user2PubKey);

      // Encrypt attachment if present
      let encAttachment = '';
      if (attachment) {
        const att_ct1 = await Crypto.encryptForChat(attachment, user1PubKey);
        const att_ct2 = await Crypto.encryptForChat(attachment, user2PubKey);
        encAttachment = JSON.stringify({ att_ct1, att_ct2 });
      }

      const result = await API.post('api/chat/messages/send', {
        conversation_id: this._activeConvId, ciphertext_user1, ciphertext_user2,
        reply_to: replyTo ? replyTo.id : '', attachment: encAttachment,
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
    html += '</div>';
    cats.forEach((c, i) => {
      html += `<div class="emoji-picker__grid" id="emoji-cat-${i}" style="${i>0?'display:none':''}">`;
      html += EMOJI_CATEGORIES[c].map(e => `<button class="emoji-picker__item" onclick="Chat._insertEmoji('${e}')">${e}</button>`).join('');
      html += '</div>';
    });
    html += '</div>';
    picker.innerHTML = html;
    picker.style.display = 'block';
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
      // Only refresh conversation list every 5s (every 10th tick)
      this._convPollCount++;
      if (this._convPollCount >= 10) {
        this._convPollCount = 0;
        this._checkConversations();
      }
    }, 500);
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

  // ── SCROLL ──
  scrollToBottom() {
    const c = document.getElementById('chat-messages');
    if (c) c.scrollTop = c.scrollHeight;
    const btn = document.getElementById('chat-scroll-btn');
    if (btn) btn.style.display = 'none';
  },

  // ── RENDER CONVERSATIONS ──
  _lastConvHtml: '',

  renderConversations() {
    const list = document.getElementById('chat-conv-list');
    if (!list) return;

    if (this._conversations.length === 0) {
      list.innerHTML = '<div style="padding:24px 16px;text-align:center;font-size:0.8rem;color:var(--color-text-muted);">No conversations yet.<br>Search for a user above.</div>';
      this._lastConvHtml = '';
      return;
    }

    const requests = this._conversations.filter(c => c.is_request);
    const pending = this._conversations.filter(c => c.is_pending);
    const accepted = this._conversations.filter(c => c.status === 'accepted');

    let html = '';

    if (requests.length > 0) {
      html += '<div style="padding:8px 16px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-text-muted);border-bottom:var(--border-muted);">Requests (' + requests.length + ')</div>';
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
    }

    if (pending.length > 0) {
      html += '<div style="padding:8px 16px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-text-muted);border-bottom:var(--border-muted);">Pending</div>';
      html += pending.map(c => this._renderConvItem(c, '#ff9f4a', 'Waiting for response')).join('');
    }

    if (accepted.length > 0) {
      if (requests.length > 0 || pending.length > 0)
        html += '<div style="padding:8px 16px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-text-muted);border-bottom:var(--border-muted);">Messages</div>';
      html += accepted.map(c => this._renderConvItem(c)).join('');
    }

    html = html || '<div style="padding:24px 16px;text-align:center;font-size:0.8rem;color:var(--color-text-muted);">No conversations yet.</div>';

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
      document.getElementById('chat-header-name').textContent = (conv.other_user_name || 'Unknown') + ' (@' + (conv.other_user_uid || '') + ')';
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

    container.innerHTML = html;
    if (wasAtBottom) container.scrollTop = container.scrollHeight;
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
    const msgs = this._messages[this._activeConvId] || [];
    const msg = msgs.find(m => m.id === msgId);
    const isMine = msg && (msg._isMine || (this._myUserId && msg.sender_id === this._myUserId));

    const attachStr = msg ? (msg._decryptedAttachment || msg.attachment || '') : '';
    const hasAttach = attachStr.length > 2; // not empty or '[]'

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
    menuEl.id = 'chat-active-menu';
    menuEl.innerHTML = menuHtml;
    row.appendChild(menuEl.firstElementChild);
  },

  _closeMenu() {
    this._openMenuId = null;
    const existing = document.querySelector('.chat-msg__menu');
    if (existing) existing.remove();
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
    const panel = document.getElementById('chat-pin-panel');
    if (!panel) return;
    if (this._pinPanelOpen) {
      panel.style.display = 'flex';
      this._loadPins();
    } else {
      panel.style.display = 'none';
    }
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
