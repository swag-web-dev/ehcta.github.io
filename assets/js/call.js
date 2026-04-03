// ── AUDIO CALL MODULE ──

(function() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── INCOMING CALL OVERLAY ── */
    .call-incoming {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 500; background: rgba(0,0,0,0.85);
      display: flex; align-items: center; justify-content: center;
      padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
    }
    .call-incoming__card {
      background: var(--color-bg, #000); border: var(--border, 1px solid #fff);
      padding: 32px 40px; text-align: center; width: 320px; max-width: 90vw;
    }
    .call-incoming__name {
      font-family: var(--font-title, serif); font-size: 1.4rem; font-weight: 500;
      margin-bottom: 4px;
    }
    .call-incoming__uid {
      font-size: 0.8rem; color: var(--color-text-muted, #888); margin-bottom: 8px;
    }
    .call-incoming__label {
      font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--color-text-muted, #888); margin-bottom: 24px;
    }
    .call-incoming__pulse {
      width: 12px; height: 12px; border-radius: 50%; background: #4aff7a;
      display: inline-block; margin-right: 8px; animation: callPulse 1.5s ease-in-out infinite;
    }
    @keyframes callPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
    }
    .call-incoming__btns {
      display: flex; gap: 12px; justify-content: center;
    }
    .call-incoming__btn {
      padding: 12px 28px; font-size: 0.85rem; font-family: var(--font-body, sans-serif);
      text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; border: none;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    .call-incoming__btn--accept {
      background: #4aff7a; color: #000;
    }
    .call-incoming__btn--accept:hover { background: #3de06a; }
    .call-incoming__btn--decline {
      background: #e74c3c; color: #fff;
    }
    .call-incoming__btn--decline:hover { background: #c0392b; }

    /* ── IN-CALL BAR (minimised) ── */
    .call-bar {
      position: fixed; bottom: 20px; right: 20px; z-index: 400;
      background: var(--color-bg, #000); border: var(--border, 1px solid #fff);
      padding: 12px 16px; min-width: 280px; max-width: 360px;
      cursor: move; user-select: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    }
    .call-bar__header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px;
    }
    .call-bar__name {
      font-weight: 500; font-size: 0.9rem;
    }
    .call-bar__time {
      font-size: 0.7rem; color: var(--color-text-muted, #888);
      font-variant-numeric: tabular-nums;
    }
    .call-bar__status {
      font-size: 0.7rem; color: var(--color-text-muted, #888);
      margin-bottom: 10px;
    }
    .call-bar__status--connected { color: #4aff7a; }
    .call-bar__volume {
      display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    }
    .call-bar__volume-label {
      font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--color-text-muted, #888); white-space: nowrap;
    }
    .call-bar__volume-slider {
      flex: 1; -webkit-appearance: none; appearance: none;
      height: 4px; background: #333; outline: none; cursor: pointer;
    }
    .call-bar__volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 14px; height: 14px;
      background: var(--color-text, #fff); border-radius: 0; cursor: pointer;
    }
    .call-bar__volume-slider::-moz-range-thumb {
      width: 14px; height: 14px; background: var(--color-text, #fff);
      border: none; border-radius: 0; cursor: pointer;
    }
    .call-bar__controls {
      display: flex; gap: 8px;
    }
    .call-bar__btn {
      flex: 1; padding: 8px; font-size: 0.75rem; font-family: var(--font-body, sans-serif);
      text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer;
      border: var(--border-muted, 1px solid #333); background: transparent;
      color: var(--color-text, #fff); text-align: center;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    .call-bar__btn:hover { background: rgba(255,255,255,0.05); }
    .call-bar__btn--mute-active {
      background: var(--color-text, #fff); color: var(--color-bg, #000);
    }
    .call-bar__btn--end {
      background: #e74c3c; color: #fff; border-color: #e74c3c;
    }
    .call-bar__btn--end:hover { background: #c0392b; }

    /* ── CALL BUTTON IN HEADER ── */
    .chat-call-btn {
      background: none; border: none; color: var(--color-text-muted, #888);
      cursor: pointer; font-size: 1.1rem; padding: 2px 4px; line-height: 1;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    .chat-call-btn:hover { color: var(--color-text, #fff); }
    .chat-call-btn:disabled { opacity: 0.3; cursor: default; }

    /* ── MOBILE RESPONSIVE ── */
    @media (max-width: 600px) {
      .call-bar {
        left: 8px; right: 8px; bottom: 8px;
        min-width: auto; max-width: none;
        padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      }
      .call-incoming__card {
        padding: 24px 20px;
      }
      .call-incoming__btn {
        padding: 14px 20px; font-size: 0.9rem;
      }
    }
  `;
  document.head.appendChild(style);

  // iOS Safari: create a persistent hidden <audio> element for remote audio playback.
  // iOS blocks Audio() objects created outside of user gestures, but a pre-existing
  // <audio> element that gets its srcObject set during a user-initiated flow works.
  const audioEl = document.createElement('audio');
  audioEl.id = 'call-remote-audio';
  audioEl.setAttribute('playsinline', '');
  audioEl.setAttribute('autoplay', '');
  // WebKit needs the element in the DOM
  audioEl.style.display = 'none';
  document.body.appendChild(audioEl);
})();

const Call = {
  _pc: null,
  _localStream: null,
  _remoteAudio: null,
  _state: 'idle', // idle, calling, ringing, connected
  _convId: null,
  _otherName: '',
  _otherUid: '',
  _muted: false,
  _timer: null,
  _seconds: 0,
  _ringtoneAudio: null,

  // ICE servers for NAT traversal
  _iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],

  // ── INITIATE CALL ──
  async start(convId) {
    if (this._state !== 'idle') {
      Toast.show('Already in a call', true);
      return;
    }
    const conv = Chat._conversations.find(c => c.id === convId);
    if (!conv || conv.status !== 'accepted') {
      Toast.show('Cannot call this user', true);
      return;
    }

    this._convId = convId;
    this._otherName = conv.other_user_name || 'Unknown';
    this._otherUid = conv.other_user_uid || '';
    this._state = 'calling';

    // Prime the audio element with a user gesture (required on iOS)
    this._primeAudio();

    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      Toast.show('Microphone access denied', true);
      this._state = 'idle';
      return;
    }

    // Send call request via WebSocket
    const myName = (document.getElementById('nav-display-name') || {}).textContent || 'Unknown';
    this._sendSignal('call_request', { name: myName });
    this._showCallBar('Calling...');
    this._startRingtone('outgoing');
  },

  // Prime the persistent audio element so iOS allows playback later
  _primeAudio() {
    const el = document.getElementById('call-remote-audio');
    if (el) {
      // Play silence to unlock the element on iOS
      el.play().catch(() => {});
    }
  },

  // ── HANDLE INCOMING SIGNALS ──
  handleSignal(msg) {
    const signal = msg.signal;
    const data = msg.data;
    const convId = msg.conversation_id;
    const fromUserId = msg.from;

    switch (signal) {
      case 'call_request':
        this._onIncomingCall(convId, fromUserId, data);
        break;
      case 'call_accept':
        this._onCallAccepted(convId);
        break;
      case 'call_decline':
        this._onCallDeclined();
        break;
      case 'call_end':
        this._onCallEnded();
        break;
      case 'offer':
        this._onOffer(convId, data);
        break;
      case 'answer':
        this._onAnswer(data);
        break;
      case 'ice':
        this._onIce(data);
        break;
    }
  },

  // ── INCOMING CALL ──
  _onIncomingCall(convId, fromUserId, data) {
    if (this._state !== 'idle') {
      // Already in a call, auto-decline
      const origConv = this._convId;
      this._convId = convId;
      this._sendSignal('call_decline');
      this._convId = origConv;
      return;
    }

    this._convId = convId;
    const conv = Chat._conversations.find(c => c.id === convId);
    this._otherName = conv ? (conv.other_user_name || 'Unknown') : (data && data.name || 'Unknown');
    this._otherUid = conv ? (conv.other_user_uid || '') : '';
    this._state = 'ringing';

    this._startRingtone('incoming');
    this._showIncomingUI();
  },

  _showIncomingUI() {
    this._removeIncomingUI();
    const el = document.createElement('div');
    el.id = 'call-incoming-overlay';
    el.className = 'call-incoming';
    el.innerHTML = `
      <div class="call-incoming__card">
        <div class="call-incoming__name">${Chat._esc(this._otherName)}</div>
        <div class="call-incoming__uid">@${Chat._esc(this._otherUid)}</div>
        <div class="call-incoming__label"><span class="call-incoming__pulse"></span>Incoming Audio Call</div>
        <div class="call-incoming__btns">
          <button class="call-incoming__btn call-incoming__btn--decline" onclick="Call.decline()">Decline</button>
          <button class="call-incoming__btn call-incoming__btn--accept" onclick="Call.accept()">Accept</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  },

  _removeIncomingUI() {
    const el = document.getElementById('call-incoming-overlay');
    if (el) el.remove();
  },

  // ── ACCEPT CALL ──
  async accept() {
    this._removeIncomingUI();
    this._stopRingtone();

    // Prime audio on user gesture (iOS requirement — must happen in click handler)
    this._primeAudio();

    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      Toast.show('Microphone access denied', true);
      this._sendSignal('call_decline');
      this._cleanup();
      return;
    }

    this._state = 'connected';
    this._sendSignal('call_accept');
    this._showCallBar('Connecting...');
    // Wait for the caller to send an offer
  },

  // ── DECLINE CALL ──
  decline() {
    this._removeIncomingUI();
    this._stopRingtone();
    this._sendSignal('call_decline');
    this._cleanup();
  },

  // ── CALL ACCEPTED BY OTHER SIDE ──
  async _onCallAccepted(convId) {
    this._stopRingtone();
    if (this._state !== 'calling') return;
    this._state = 'connected';
    this._updateCallBarStatus('Connecting...');

    // Caller creates the offer
    await this._createPeerConnection();
    try {
      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);
      this._sendSignal('offer', { sdp: offer.sdp, type: offer.type });
    } catch (e) {
      Toast.show('Call setup failed', true);
      this.end();
    }
  },

  _onCallDeclined() {
    this._stopRingtone();
    Toast.show('Call declined');
    this._cleanup();
  },

  _onCallEnded() {
    Toast.show('Call ended');
    this._cleanup();
  },

  // ── WEBRTC OFFER/ANSWER/ICE ──
  async _onOffer(convId, data) {
    if (this._state !== 'connected') return;
    await this._createPeerConnection();
    try {
      await this._pc.setRemoteDescription(new RTCSessionDescription({ type: data.type, sdp: data.sdp }));
      const answer = await this._pc.createAnswer();
      await this._pc.setLocalDescription(answer);
      this._sendSignal('answer', { sdp: answer.sdp, type: answer.type });
    } catch (e) {
      Toast.show('Call setup failed', true);
      this.end();
    }
  },

  async _onAnswer(data) {
    if (!this._pc) return;
    try {
      await this._pc.setRemoteDescription(new RTCSessionDescription({ type: data.type, sdp: data.sdp }));
    } catch (e) {
      Toast.show('Call setup failed', true);
      this.end();
    }
  },

  _onIce(data) {
    if (!this._pc || !data) return;
    try {
      this._pc.addIceCandidate(new RTCIceCandidate(data));
    } catch (e) {}
  },

  // ── PEER CONNECTION ──
  async _createPeerConnection() {
    if (this._pc) return;
    this._pc = new RTCPeerConnection({ iceServers: this._iceServers });

    // Add local audio tracks
    if (this._localStream) {
      const tracks = this._localStream.getTracks();
      console.log('[CALL] adding', tracks.length, 'local tracks');
      for (const track of tracks) {
        console.log('[CALL] local track:', track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState);
        this._pc.addTrack(track, this._localStream);
      }
    } else {
      console.warn('[CALL] no local stream when creating peer connection!');
    }

    // Handle remote audio — use the persistent <audio> element for iOS compatibility
    this._pc.ontrack = (e) => {
      console.log('[CALL] ontrack fired, streams:', e.streams.length, 'tracks:', e.streams[0]?.getTracks().length);
      const stream = e.streams[0];

      // Log audio track state
      for (const t of stream.getAudioTracks()) {
        console.log('[CALL] remote audio track:', t.label, 'enabled:', t.enabled, 'muted:', t.muted, 'readyState:', t.readyState);
      }

      const audioEl = document.getElementById('call-remote-audio');
      if (audioEl) {
        audioEl.srcObject = stream;
        audioEl.muted = false;
        audioEl.volume = 1.0;
        const playPromise = audioEl.play();
        if (playPromise) {
          playPromise.then(() => console.log('[CALL] audio playing OK'))
                     .catch(err => console.error('[CALL] audio play failed:', err));
        }
        this._remoteAudio = audioEl;
      } else {
        // Fallback: create Audio object (works on desktop/Android)
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = stream;
        audio.play().catch(err => console.error('[CALL] fallback audio play failed:', err));
        this._remoteAudio = audio;
      }
      // Apply current volume
      const slider = document.getElementById('call-volume-slider');
      if (slider && this._remoteAudio) this._remoteAudio.volume = slider.value / 100;

      this._updateCallBarStatus('Connected');
      this._startTimer();
    };

    // Send ICE candidates
    this._pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._sendSignal('ice', e.candidate.toJSON());
      }
    };

    // Monitor connection state
    this._pc.oniceconnectionstatechange = () => {
      if (!this._pc) return;
      const state = this._pc.iceConnectionState;
      console.log('[CALL] ICE state:', state);
      if (state === 'failed') {
        Toast.show('Call connection failed', true);
        this.end();
      } else if (state === 'disconnected') {
        this._updateCallBarStatus('Reconnecting...');
        // Give it a few seconds to recover before ending
        this._disconnectTimer = setTimeout(() => {
          if (this._pc && this._pc.iceConnectionState === 'disconnected') {
            Toast.show('Call connection lost', true);
            this.end();
          }
        }, 5000);
      } else if (state === 'connected' || state === 'completed') {
        clearTimeout(this._disconnectTimer);
        this._updateCallBarStatus('Connected');
      }
    };
  },

  // ── END CALL ──
  end() {
    this._sendSignal('call_end');
    this._cleanup();
  },

  _cleanup() {
    this._stopRingtone();
    this._removeIncomingUI();
    this._removeCallBar();
    this._stopTimer();
    clearTimeout(this._disconnectTimer);
    if (this._pc) { this._pc.close(); this._pc = null; }
    if (this._localStream) {
      this._localStream.getTracks().forEach(t => t.stop());
      this._localStream = null;
    }
    // Reset the persistent audio element but don't remove it
    const audioEl = document.getElementById('call-remote-audio');
    if (audioEl) { audioEl.srcObject = null; audioEl.pause(); }
    this._remoteAudio = null;
    this._state = 'idle';
    this._convId = null;
    this._muted = false;
    this._seconds = 0;
  },

  // ── MUTE TOGGLE ──
  toggleMute() {
    if (!this._localStream) return;
    this._muted = !this._muted;
    this._localStream.getAudioTracks().forEach(t => t.enabled = !this._muted);
    const btn = document.getElementById('call-mute-btn');
    if (btn) {
      btn.textContent = this._muted ? 'Unmute' : 'Mute';
      btn.classList.toggle('call-bar__btn--mute-active', this._muted);
    }
  },

  // ── VOLUME CONTROL ──
  setVolume(val) {
    if (this._remoteAudio) {
      this._remoteAudio.volume = val / 100;
    }
  },

  // ── CALL TIMER ──
  _startTimer() {
    this._stopTimer();
    this._seconds = 0;
    this._timer = setInterval(() => {
      this._seconds++;
      const el = document.getElementById('call-timer');
      if (el) el.textContent = this._formatDuration(this._seconds);
    }, 1000);
  },

  _stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  _formatDuration(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
  },

  // ── RINGTONE ──
  _startRingtone(type) {
    this._stopRingtone();
    try {
      this._ringtoneAudio = new Audio('assets/ringtone.m4a');
      this._ringtoneAudio.loop = true;
      this._ringtoneAudio.volume = type === 'incoming' ? 0.8 : 0.3;
      this._ringtoneAudio.play().catch(() => {});
    } catch(e) {}
  },

  _stopRingtone() {
    try {
      if (this._ringtoneAudio) {
        this._ringtoneAudio.pause();
        this._ringtoneAudio.currentTime = 0;
        this._ringtoneAudio = null;
      }
    } catch(e) {}
  },

  // ── SIGNALING ──
  _sendSignal(signal, data) {
    if (Chat._ws && Chat._ws.readyState === WebSocket.OPEN && this._convId) {
      Chat._ws.send(JSON.stringify({
        type: 'call_signal',
        conversation_id: this._convId,
        signal: signal,
        data: data || null,
      }));
    }
  },

  // ── CALL BAR UI (minimised, draggable) ──
  _showCallBar(statusText) {
    this._removeCallBar();
    const el = document.createElement('div');
    el.id = 'call-bar';
    el.className = 'call-bar';
    el.innerHTML = `
      <div class="call-bar__header">
        <div class="call-bar__name">${Chat._esc(this._otherName)}</div>
        <span class="call-bar__time" id="call-timer">00:00</span>
      </div>
      <div class="call-bar__status" id="call-status">${statusText || 'Connecting...'}</div>
      <div class="call-bar__volume">
        <span class="call-bar__volume-label">Their Volume</span>
        <input type="range" id="call-volume-slider" class="call-bar__volume-slider" min="0" max="100" value="100" oninput="Call.setVolume(this.value)">
      </div>
      <div class="call-bar__controls">
        <button id="call-mute-btn" class="call-bar__btn" onclick="Call.toggleMute()">Mute</button>
        <button class="call-bar__btn call-bar__btn--end" onclick="Call.end()">End</button>
      </div>
    `;
    document.body.appendChild(el);
    this._makeDraggable(el);
  },

  _removeCallBar() {
    const el = document.getElementById('call-bar');
    if (el) el.remove();
  },

  _updateCallBarStatus(text) {
    const el = document.getElementById('call-status');
    if (el) {
      el.textContent = text;
      el.className = 'call-bar__status' + (text === 'Connected' ? ' call-bar__status--connected' : '');
    }
  },

  _makeDraggable(el) {
    let offsetX = 0, offsetY = 0, dragging = false;

    // Mouse
    el.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      dragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      el.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = (e.clientX - offsetX) + 'px';
      el.style.top = (e.clientY - offsetY) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    // Touch — use non-passive so we can preventDefault to stop page scroll while dragging
    el.addEventListener('touchstart', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      dragging = true;
      const t = e.touches[0];
      offsetX = t.clientX - el.getBoundingClientRect().left;
      offsetY = t.clientY - el.getBoundingClientRect().top;
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      e.preventDefault(); // Prevent page scrolling while dragging call bar
      const t = e.touches[0];
      el.style.left = (t.clientX - offsetX) + 'px';
      el.style.top = (t.clientY - offsetY) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }, { passive: false });
    document.addEventListener('touchend', () => { dragging = false; });
  },
};
