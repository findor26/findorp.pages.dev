const myId = 'Findor-' + Math.random().toString(36).substring(7);
let ably = null;
let lobbyChannel = null;
let currentChatChannel = null; // 当前正在聊天的频道实例

/**
 * MD3 风格的 Snackbar (Toast) 提示
 */
function showToast(message) {
    let toast = document.getElementById('md3-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'md3-toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = 'show';
    
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

// --- 1. 初始化应用 ---
async function initApp() {
    try {
        const response = await fetch('/api/auth');
        if (!response.ok) throw new Error("Auth failed");
        const apiKey = await response.text();
        
        ably = new Ably.Realtime({ 
            key: apiKey.trim(), 
            clientId: myId,
            echoMessages: false 
        });

        lobbyChannel = ably.channels.get('lobby');

        // 监听大厅成员变化，实时更新房间列表
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], () => {
            fetchAndRenderRooms();
        });

        // 默认进入公共大厅
        joinRoom('Lobby', '公共频道');

        showToast("服务连接成功");
    } catch (err) {
        console.error("Critical Error:", err);
        showToast("系统连接异常，请检查 API 配置");
    }
}

// --- 2. 消息处理逻辑 ---

/**
 * 发送消息
 */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || !currentChatChannel) return;

    try {
        // 发布消息到当前频道
        await currentChatChannel.publish('chat-msg', {
            text: message,
            sender: myId,
            timestamp: Date.now()
        });

        // 本地立即渲染自己发送的消息
        renderMessage({
            data: {
                text: message,
                sender: myId
            }
        }, true);

        input.value = ''; // 清空输入框
    } catch (err) {
        showToast("消息发送失败");
    }
}

/**
 * 渲染消息到 UI
 * @param {Object} msgObj Ably 消息对象
 * @param {boolean} isMe 是否由本人发送
 */
function renderMessage(msgObj, isMe = false) {
    const container = document.getElementById('message-container');
    const { text, sender } = msgObj.data;

    const messageElement = document.createElement('div');
    messageElement.className = `msg-bubble ${isMe ? 'is-me' : ''}`;
    
    messageElement.innerHTML = `
        <div class="sender-name">${isMe ? '我' : sender}</div>
        <div class="msg-content">${text}</div>
    `;

    container.appendChild(messageElement);
    // 滚动到最新消息
    container.scrollTop = container.scrollHeight;
}

// --- 3. 房间切换逻辑 ---

/**
 * 加入指定房间
 * @param {string} roomId 房间唯一标识
 * @param {string} roomName 房间显示名称
 */
async function joinRoom(roomId, roomName) {
    // 1. 如果已有频道，先取消订阅并离开
    if (currentChatChannel) {
        currentChatChannel.unsubscribe();
    }

    // 2. 更新大厅 Presence 状态，让其他人看到我在哪个房间
    await lobbyChannel.presence.update({ 
        currentRoom: roomId,
        roomTitle: roomName
    });

    // 3. 获取新频道实例并订阅消息
    currentChatChannel = ably.channels.get(`chat:${roomId}`);
    currentChatChannel.subscribe('chat-msg', (msg) => {
        renderMessage(msg, false); // 接收他人的消息
    });

    // 4. 更新 UI 标题和清空旧消息
    document.querySelector('.title-large').textContent = roomName;
    document.getElementById('message-container').innerHTML = '';
    
    showToast(`已进入: ${roomName}`);
    fetchAndRenderRooms(); // 刷新房间人数统计
}

// --- 4. 房间列表同步 ---
async function fetchAndRenderRooms() {
    if (!lobbyChannel) return;

    lobbyChannel.presence.get((err, members) => {
        if (err) return;

        const roomsMap = new Map();
        members.forEach(member => {
            const data = member.data || {};
            const roomId = data.currentRoom || 'Lobby';
            const roomName = data.roomTitle || '未知频道';

            if (!roomsMap.has(roomId)) {
                roomsMap.set(roomId, { id: roomId, name: roomName, members: 0 });
            }
            roomsMap.get(roomId).members++;
        });

        updateOnlineCount(members.length);
        // 如果当前是“大厅”视图，可以根据需要决定是否渲染房间列表
        // 这里假设点击左侧“group”图标时显示列表，点击“chat”显示消息
    });
}

function updateOnlineCount(count) {
    const countEl = document.getElementById('online-count');
    if (countEl) countEl.textContent = count;
}

// --- 5. 事件绑定 ---

// 发送按钮点击
document.getElementById('send-btn').onclick = sendMessage;

// 回车键发送
document.getElementById('chat-input').onkeydown = (e) => {
    if (e.key === 'Enter') sendMessage();
};

// 创建房间 FAB
document.querySelector('.fab-btn').onclick = async () => {
    const name = prompt("请输入新房间名称:");
    if (name) {
        const newRoomId = 'room-' + Date.now();
        await joinRoom(newRoomId, name);
    }
};

// 启动
initApp();