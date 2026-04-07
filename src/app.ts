/**
 * ST-Chat Frontend Application
 * Lightweight and stable chat client with WebSocket support
 * 軽量で安定したチャットクライアント
 */

let ws: WebSocket | null = null;
let username: string = "";
let email: string = "";
let currentRoom: string | null = null;
let appReady: boolean = false;

const API_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000";

/**
 * DOM elements cache
 * パフォーマンス向上のためのDOM要素キャッシュ
 */
const dom = {
  usernameDiv: document.getElementById("username") as HTMLElement | null,
  emailDiv: document.getElementById("email") as HTMLElement | null,
  usercount: document.getElementById("usercount") as HTMLElement | null,
  homeView: document.getElementById("homeView") as HTMLElement | null,
  chatView: document.getElementById("chatView") as HTMLElement | null,
  roomTitle: document.getElementById("roomTitle") as HTMLElement | null,
  chat: document.getElementById("chat") as HTMLElement | null,
  msg: document.getElementById("msg") as HTMLTextAreaElement | null,
  roomGrid: document.getElementById("roomGrid") as HTMLElement | null,
  roomList: document.getElementById("roomList") as HTMLElement | null,
  modalOverlay: document.getElementById("modalOverlay") as HTMLElement | null,
  modalForm: document.getElementById("modalForm") as HTMLElement | null,
};

/**
 * Validate DOM elements
 * DOM要素の妥当性チェック（初期化）
 */
function validateDOM(): boolean {
  const required = [
    "usernameDiv",
    "emailDiv",
    "homeView",
    "chatView",
    "chat",
    "msg",
    "modalOverlay",
    "modalForm",
  ];
  for (const key of required) {
    if (!dom[key as keyof typeof dom]) {
      console.error(`[ERROR] Required DOM element missing: ${key}`);
      return false;
    }
  }
  return true;
}

/**
 * Show user info modal / ユーザー情報入力モーダルを表示
 */
function showUserModal(): Promise<void> {
  return new Promise(() => {
    if (dom.modalOverlay) {
      dom.modalOverlay.style.display = "flex";
    }
  });
}

/**
 * Close user info modal / ユーザー情報入力モーダルを閉じる
 */
function closeUserModal(): void {
  if (dom.modalOverlay) {
    dom.modalOverlay.style.display = "none";
  }
}

/**
 * Submit user info / ユーザー情報を送信
 */
function submitUserInfo(): void {
  const usernameInput = document.getElementById(
    "usernameInput"
  ) as HTMLInputElement | null;
  const emailInput = document.getElementById(
    "emailInput"
  ) as HTMLInputElement | null;

  if (!usernameInput || !emailInput) {
    console.error("[ERROR] Input elements not found");
    return;
  }

  username = usernameInput.value.trim() || "Anonymous";
  email = emailInput.value.trim() || "";

  if (!username) {
    alert("Please enter username");
    return;
  }

  // Update UI with user info
  if (dom.usernameDiv) {
    dom.usernameDiv.textContent = username;
  }
  if (dom.emailDiv) {
    dom.emailDiv.textContent = email || "No email";
  }

  closeUserModal();
  appReady = true;
  loadRooms().catch((err) => {
    console.error("[ERROR] Failed to load rooms:", err);
  });

  console.log(`[INFO] User info set: ${username} / ${email}`);
}

/**
 * Load rooms from server
 * サーバーからルーム一覧を取得して表示
 */
async function loadRooms(): Promise<void> {
  if (!appReady) return;

  try {
    const res = await fetch(`${API_URL}/rooms`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    renderRooms(data);
  } catch (error) {
    console.error("[ERROR] Failed to load rooms:", error);
    if (dom.roomGrid) {
      dom.roomGrid.innerHTML = "<p>Failed to load rooms</p>";
    }
  }
}

/**
 * Render rooms to UI
 * ルームをUIに描画
 */
function renderRooms(rooms: Array<{ name: string; private: boolean }>): void {
  if (dom.roomGrid) dom.roomGrid.innerHTML = "";
  if (dom.roomList) dom.roomList.innerHTML = "";

  if (!Array.isArray(rooms) || rooms.length === 0) {
    if (dom.roomGrid) {
      dom.roomGrid.innerHTML = "<p>No rooms</p>";
    }
    return;
  }

  rooms.forEach((room) => {
    // Grid tile
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.textContent = room.name + (room.private ? " 🔒" : "");
    tile.onclick = () => joinRoom(room);
    dom.roomGrid?.appendChild(tile);

    // Right list item
    const listItem = document.createElement("div");
    listItem.className = "card";
    listItem.textContent = room.name;
    listItem.onclick = () => joinRoom(room);
    dom.roomList?.appendChild(listItem);
  });
}

/**
 * Join room
 * ルームに参加
 */
function joinRoom(room: { name: string; private: boolean }): void {
  let key = "";

  // Password check for private room
  if (room.private) {
    key = prompt("Enter room password:") || "";
    if (!key) return;
  }

  currentRoom = room.name;
  connect(key);

  // Switch view
  if (dom.homeView) dom.homeView.style.display = "none";
  if (dom.chatView) dom.chatView.style.display = "flex";
  if (dom.roomTitle) {
    dom.roomTitle.textContent = room.name + (room.private ? " 🔒" : "");
  }

  console.log(`[INFO] Joined room: ${room.name}`);
}

/**
 * Create new room
 * 新しいルームを作成
 */
async function createRoom(): Promise<void> {
  const name = prompt("Enter room name:");
  if (!name?.trim()) return;

  const isPrivate = confirm("Create as private room?");
  let key = "";

  if (isPrivate) {
    key = prompt("Set room password:") || "";
    if (!key) return;
  }

  try {
    const res = await fetch(`${API_URL}/create_room`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), key }),
    });

    if (!res.ok) throw new Error("Creation failed");

    alert("Room created!");
    await loadRooms();
    console.log(`[INFO] Room created: ${name}`);
  } catch (error) {
    console.error("[ERROR] Failed to create room:", error);
    alert("Failed to create room");
  }
}

/**
 * Connect to WebSocket
 * WebSocket接続確立
 */
function connect(key: string = ""): void {
  // Close previous connection
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      ws.close();
    } catch (e) {
      console.log("[WARNING] Failed to close previous connection");
    }
  }

  try {
    const roomName = encodeURIComponent(currentRoom || "");
    ws = new WebSocket(`${WS_URL}/ws/${roomName}`);

    ws.onopen = () => {
      console.log("[INFO] WebSocket connected");
      ws?.send(JSON.stringify({ name: username, email, key }));
    };

    ws.onmessage = (event: MessageEvent) => {
      handleMessage(event.data);
    };

    ws.onerror = () => {
      console.error("[ERROR] WebSocket error");
      alert("Connection error");
    };

    ws.onclose = () => {
      console.log("[INFO] WebSocket closed");
    };
  } catch (error) {
    console.error("[ERROR] WebSocket creation failed:", error);
    alert("Failed to connect");
    goHome();
  }
}

/**
 * Handle incoming WebSocket message
 * 受信メッセージ処理
 */
function handleMessage(data: string): void {
  try {
    const parsed = JSON.parse(data);

    // User count update
    if (parsed.type === "users" && dom.usercount) {
      dom.usercount.textContent = `${parsed.count} users`;
      return;
    }
  } catch {
    // Not JSON - treat as text message
  }

  addMessage(data);
}

/**
 * Display message in chat
 * メッセージをチャットに表示
 */
function addMessage(text: string): void {
  const div = document.createElement("div");
  div.className = "msg";

  // Determine message sender
  if (text.startsWith(username + ":")) {
    div.classList.add("me");
  } else {
    div.classList.add("other");
  }

  div.textContent = text;
  dom.chat?.appendChild(div);

  // Auto scroll to latest
  if (dom.chat) {
    setTimeout(() => {
      dom.chat!.scrollTop = dom.chat!.scrollHeight;
    }, 0);
  }
}

/**
 * Send message
 * メッセージ送信
 */
function send(): void {
  const msg = dom.msg?.value.trim();

  if (!msg) return;
  if (ws?.readyState !== WebSocket.OPEN) {
    alert("Not connected");
    return;
  }

  try {
    ws.send(`${username}: ${msg}`);
    if (dom.msg) dom.msg.value = "";
  } catch (error) {
    console.error("[ERROR] Failed to send:", error);
    alert("Send failed");
  }
}

/**
 * Return to home
 * ホーム画面に戻る
 */
function goHome(): void {
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      ws.close();
    } catch (e) {
      // Ignore
    }
  }

  if (dom.homeView) dom.homeView.style.display = "flex";
  if (dom.chatView) dom.chatView.style.display = "none";
  if (dom.chat) dom.chat.innerHTML = "";

  loadRooms().catch((err) => {
    console.error("[ERROR] Failed to reload rooms:", err);
  });
}

/**
 * Setup event listeners
 * イベントリスナーの設定
 */
function setupEventListeners(): void {
  // Enter key to send message
  dom.msg?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // Submit user info on Enter
  const usernameInput = document.getElementById("usernameInput");
  const emailInput = document.getElementById("emailInput");

  usernameInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      emailInput?.focus();
    }
  });

  emailInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitUserInfo();
    }
  });
}

/**
 * Initialize application
 * アプリケーション初期化
 */
document.addEventListener("DOMContentLoaded", (): void => {
  console.log("[INFO] Starting application...");

  if (!validateDOM()) {
    console.error("[ERROR] DOM validation failed");
    return;
  }

  setupEventListeners();
  showUserModal();

  console.log("[INFO] Application ready");
});