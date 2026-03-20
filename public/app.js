'use strict';

// ─── Color constants (mirror server) ─────────────────────────────────────────
const USER_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12',
  '#1ABC9C', '#E67E22', '#C0392B', '#2980B9', '#27AE60',
  '#8E44AD', '#D35400', '#16A085', '#2C3E50', '#7D3C98'
];

// ─── State ────────────────────────────────────────────────────────────────────
let socket = null;
let currentUser = { name: '', color: USER_COLORS[0] };
let currentRoom = null;
let botMode = 'A';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const loginScreen   = document.getElementById('login-screen');
const appScreen     = document.getElementById('app-screen');
const usernameInput = document.getElementById('username-input');
const colorPicker   = document.getElementById('color-picker');
const enterBtn      = document.getElementById('enter-btn');

const sidebar       = document.getElementById('sidebar');
const sidebarClose  = document.getElementById('sidebar-close');
const sidebarToggle = document.getElementById('sidebar-toggle');

const roomListEl      = document.getElementById('room-list');
const createRoomBtn   = document.getElementById('create-room-btn');
const createRoomModal = document.getElementById('create-room-modal');
const newRoomNameInput= document.getElementById('new-room-name');
const cancelCreateRoom= document.getElementById('cancel-create-room');
const confirmCreateRoom= document.getElementById('confirm-create-room');

const chatRoomName   = document.getElementById('chat-room-name');
const countNum       = document.getElementById('count-num');
const userBadge      = document.getElementById('user-badge');
const messagesEl     = document.getElementById('messages');
const msgInput       = document.getElementById('msg-input');
const sendBtn        = document.getElementById('send-btn');

const vodTextLogin   = document.getElementById('vod-text-login');
const vodRefLogin    = document.getElementById('vod-ref-login');
const vodTextSidebar = document.getElementById('vod-text-sidebar');
const vodRefSidebar  = document.getElementById('vod-ref-sidebar');

const verseSearchInput = document.getElementById('verse-search-input');
const verseSearchBtn   = document.getElementById('verse-search-btn');
const verseResultsEl   = document.getElementById('verse-results');

const botModeBtns    = document.querySelectorAll('.bot-mode-btn');

// ─── Build color picker ───────────────────────────────────────────────────────
function buildColorPicker() {
  USER_COLORS.forEach((color, i) => {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch' + (i === 0 ? ' selected' : '');
    swatch.style.background = color;
    swatch.setAttribute('aria-label', `Pick color ${color}`);
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
      swatch.classList.add('selected');
      currentUser.color = color;
    });
    colorPicker.appendChild(swatch);
  });
}

// ─── Login ────────────────────────────────────────────────────────────────────
function enterApp() {
  const name = usernameInput.value.trim();
  if (!name) {
    usernameInput.focus();
    usernameInput.style.borderColor = '#e74c3c';
    setTimeout(() => { usernameInput.style.borderColor = ''; }, 1500);
    return;
  }
  currentUser.name = name;
  userBadge.textContent = name;
  userBadge.style.color = currentUser.color;

  loginScreen.classList.remove('active');
  appScreen.classList.add('active');

  initSocket();
}

enterBtn.addEventListener('click', enterApp);
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enterApp(); });

// ─── Socket.IO ────────────────────────────────────────────────────────────────
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    // If we were in a room before (reconnect), rejoin it
    if (currentRoom) {
      socket.emit('join_room', { room: currentRoom, name: currentUser.name, color: currentUser.color });
    }
  });

  socket.on('room_list', (rooms) => {
    renderRoomList(rooms);
  });

  socket.on('verse_of_day', (verse) => {
    setVerseOfDay(verse);
  });

  socket.on('message_history', (messages) => {
    messagesEl.innerHTML = '';
    messages.forEach(appendMessage);
    scrollToBottom();
  });

  socket.on('chat_message', (msg) => {
    appendMessage(msg);
    scrollToBottom();
  });

  socket.on('system_message', (text) => {
    appendMessage({ type: 'system', text });
    scrollToBottom();
  });

  socket.on('participant_count', (count) => {
    countNum.textContent = count;
  });

  socket.on('bot_mode_changed', ({ mode }) => {
    botMode = mode;
    updateBotModeUI(mode);
  });

  socket.on('search_results', (results) => {
    renderVerseResults(results);
  });
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
function joinRoom(name) {
  currentRoom = name;
  chatRoomName.textContent = '#' + name;
  messagesEl.innerHTML = '<div class="welcome-placeholder"><div class="welcome-icon">💬</div><p>Joining #' + escHtml(name) + '…</p></div>';
  countNum.textContent = '0';

  socket.emit('join_room', { room: name, name: currentUser.name, color: currentUser.color });

  // Highlight active room
  document.querySelectorAll('.room-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.room === name);
  });

  // On mobile, close sidebar after joining
  if (window.innerWidth <= 700) {
    sidebar.classList.remove('open');
  }
}

function renderRoomList(rooms) {
  roomListEl.innerHTML = '';
  rooms.forEach(({ name, participants }) => {
    const li = document.createElement('li');
    li.className = 'room-item' + (name === currentRoom ? ' active' : '');
    li.dataset.room = name;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-item-name';
    nameSpan.textContent = '# ' + name;
    li.appendChild(nameSpan);

    if (participants > 0) {
      const badge = document.createElement('span');
      badge.className = 'room-badge';
      badge.textContent = String(participants);
      li.appendChild(badge);
    }

    li.addEventListener('click', () => joinRoom(name));
    roomListEl.appendChild(li);
  });
}

// Create room
createRoomBtn.addEventListener('click', () => {
  newRoomNameInput.value = '';
  createRoomModal.hidden = false;
  setTimeout(() => newRoomNameInput.focus(), 50);
});
cancelCreateRoom.addEventListener('click', () => { createRoomModal.hidden = true; });
confirmCreateRoom.addEventListener('click', () => {
  const name = newRoomNameInput.value.trim();
  if (!name) { newRoomNameInput.focus(); return; }
  socket.emit('create_room', { name });
  createRoomModal.hidden = true;
  // Wait a tick for server to create then join
  setTimeout(() => joinRoom(name), 150);
});
newRoomNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmCreateRoom.click(); });
// Close modal on backdrop click
createRoomModal.addEventListener('click', (e) => { if (e.target === createRoomModal) createRoomModal.hidden = true; });

// ─── Messages ─────────────────────────────────────────────────────────────────
function appendMessage(msg) {
  // Remove welcome placeholder if present
  const placeholder = messagesEl.querySelector('.welcome-placeholder');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');

  if (msg.type === 'system') {
    div.className = 'msg system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text;
    div.appendChild(bubble);
  } else if (msg.type === 'bot') {
    div.className = 'msg bot';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text;
    div.appendChild(bubble);
  } else {
    const isOwn = msg.user === currentUser.name;
    div.className = 'msg ' + (isOwn ? 'own' : 'other');

    if (!isOwn) {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'msg-name';
      nameSpan.textContent = msg.user;
      nameSpan.style.color = msg.color || '#aaa';
      const timeSpan = document.createElement('span');
      timeSpan.className = 'msg-time';
      timeSpan.textContent = formatTime(msg.ts);
      meta.appendChild(nameSpan);
      meta.appendChild(timeSpan);
      div.appendChild(meta);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text;
    div.appendChild(bubble);
  }

  messagesEl.appendChild(div);
}

function scrollToBottom() {
  const wrap = document.getElementById('messages-wrap');
  wrap.scrollTop = wrap.scrollHeight;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Sending messages ─────────────────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !currentRoom) return;
  socket.emit('chat_message', { text });
  msgInput.value = '';
  msgInput.style.height = 'auto';
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
});

// ─── Verse of the Day ─────────────────────────────────────────────────────────
function setVerseOfDay(verse) {
  vodTextLogin.textContent   = verse.text;
  vodRefLogin.textContent    = verse.ref;
  vodTextSidebar.textContent = verse.text;
  vodRefSidebar.textContent  = verse.ref;
}

// ─── Verse Search ─────────────────────────────────────────────────────────────
function doVerseSearch() {
  const q = verseSearchInput.value.trim();
  if (!q || !socket) return;
  socket.emit('search_verses', { query: q });
}

verseSearchBtn.addEventListener('click', doVerseSearch);
verseSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerseSearch(); });

function renderVerseResults(results) {
  verseResultsEl.innerHTML = '';
  if (!results.length) {
    const li = document.createElement('li');
    li.style.cssText = 'font-size:.78rem;color:var(--text-muted);padding:.3rem 0';
    li.textContent = 'No verses found.';
    verseResultsEl.appendChild(li);
    return;
  }
  results.forEach((v) => {
    const li = document.createElement('li');
    li.className = 'verse-result-item';
    li.innerHTML = `<span class="verse-result-ref">${escHtml(v.ref)}</span><span class="verse-result-text">${escHtml(v.text)}</span>`;
    // Click to share in chat
    li.title = 'Click to share in chat';
    li.addEventListener('click', () => {
      if (currentRoom) {
        socket.emit('chat_message', { text: `📖 "${v.text}" — ${v.ref}` });
      }
    });
    verseResultsEl.appendChild(li);
  });
}

// ─── Bible Bot mode ───────────────────────────────────────────────────────────
botModeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (socket) {
      socket.emit('set_bot_mode', { mode });
    } else {
      botMode = mode;
      updateBotModeUI(mode);
    }
  });
});

function updateBotModeUI(mode) {
  botModeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// ─── Sidebar toggle (mobile) ──────────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
sidebarClose.addEventListener('click',  () => sidebar.classList.remove('open'));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
buildColorPicker();

// Fetch verse of the day immediately on load (before socket login)
fetch('/api/verse-of-day')
  .then((r) => r.json())
  .then((verse) => setVerseOfDay(verse))
  .catch(() => {});
