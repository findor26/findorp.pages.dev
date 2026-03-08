const myId = 'Findor-' + Math.random().toString(36).substring(7);
let ably = null;
let lobbyChannel = null;
let currentChatChannel = null;
let currentView = 'lobby'; // 标记当前视图状态

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

// --- 1. 正规化初始化 ---
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

        // 订阅大厅内所有成员的进入、离开、更新事件
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], () => {
            // 只有在视图为大厅时才刷新 UI，避免在聊天时干扰
            if (currentView === 'lobby') {
                fetchAndRenderRooms();
            }
            updateOnlineDisplay();
        });

        // 初始进入大厅
        await lobbyChannel.presence.enter({ 
            currentRoom: 'Lobby',
            roomTitle: '公共大厅'
        });

        showToast("服务连接成功");
        goToLobby(); // 初始显示大厅

    } catch (err) {
        console.error("Critical Error:", err);
        showToast("系统连接异常，请检查 API 配置");
    }
}

// --- 2. 核心视图控制逻辑 ---

/**
 * 切换到大厅视图
 */
function goToLobby() {
    currentView = 'lobby';
    document.querySelector('.title-large').textContent = "频道大厅";
    document.querySelector('.input-area').style.visibility = 'hidden'; // 大厅隐藏输入框
    
    // 更新导航图标状态
    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-lobby').classList.add('active');

    fetchAndRenderRooms();
}

/**
 * 渲染大厅中的房间列表
 */
async function fetchAndRenderRooms() {
    if (!lobbyChannel) return;

    lobbyChannel.presence.get((err, members) => {
        if (err) return console.error("Presence Error:", err);

        const roomsMap = new Map();

        members.forEach(member => {
            const data = member.data || {};
            const roomId = data.currentRoom || 'Lobby';
            const roomName = data.roomTitle || '未知频道';

            if (!roomsMap.has(roomId)) {
                roomsMap.set(roomId, {
                    id: roomId,
                    name: roomName,
                    members: 0
                });
            }
            roomsMap.get(roomId).members++;
        });

        const activeRooms = Array.from(roomsMap.values());
        updateRoomUI(activeRooms);
    });
}

/**
 * 更新大厅 UI
 */
function updateRoomUI(rooms) {
    const container = document.getElementById('message-container');
    container.innerHTML = '';

    if (rooms.length === 0) {
        container.innerHTML = `<div class="empty-state" style="text-align:center;padding:20px;opacity:0.6;">目前没有活跃房间</div>`;
        return;
    }

    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-card';
        item.onclick = () => joinRoom(room.id, room.name);
        item.innerHTML = `
            <div class="room-lead"><span class="material-symbols-rounded">groups</span></div>
            <div class="room-content">
                <div class="room-title">${room.name}</div>
                <div class="room-meta">${room.members} 用户在线 · ID: ${room.id}</div>
            </div>
            <span class="material-symbols-rounded">arrow_forward_ios</span>
        `;
        container.appendChild(item);
    });
}

/**
 * 更新顶部栏在线人数显示
 */
function updateOnlineDisplay() {
    lobbyChannel.presence.get((err, members) => {
        if (!err) {
            document.getElementById('online-count').textContent = members.length;
        }
    });
}

// --- 3. 聊天房间逻辑 ---

/**
 * 加入特定房间
 */
async function joinRoom(id, name) {
    currentView = 'chat';
    
    // 1. 如果已有频道，先取消订阅
    if (currentChatChannel) {
        currentChatChannel.unsubscribe();
    }

    // 2. 更新在 lobby 中的位置声明
    await lobbyChannel.presence.update({
        currentRoom: id,
        roomTitle: name
    });

    // 3. 订阅新房间消息
    currentChatChannel = ably.channels.get(`chat:${id}`);
    currentChatChannel.subscribe('chat-msg', (msg) => {
        renderMessage(msg, false);
    });

    // 4. UI 切换
    document.querySelector('.title-large').textContent = name;
    document.getElementById('message-container').innerHTML = ''; // 清空房间列表，准备显示消息
    document.querySelector('.input-area').style.visibility = 'visible';
    
    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-chat').classList.add('active');

    showToast(`已进入: ${name}`);
}

/**
 * 发送消息逻辑
 */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text || !currentChatChannel) return;

    await currentChatChannel.publish('chat-msg', {
        text: text,
        sender: myId
    });

    // 本地即时渲染
    renderMessage({ data: { text, sender: myId } }, true);
    input.value = '';
}

/**
 * 渲染单条消息
 */
function renderMessage(msgObj, isMe) {
    if (currentView !== 'chat') return; // 如果不在聊天视图，不渲染

    const container = document.getElementById('message-container');
    const { text, sender } = msgObj.data;

    const msgBubble = document.createElement('div');
    msgBubble.className = `msg-bubble ${isMe ? 'is-me' : ''}`;
    
    msgBubble.innerHTML = `
        <div class="sender-name">${isMe ? '我' : sender}</div>
        <div class="msg-content">${text}</div>
    `;

    container.appendChild(msgBubble);
    container.scrollTop = container.scrollHeight;
}

// --- 4. 功能性操作 ---

/**
 * 退出应用断开连接
 */
function logout() {
    if (confirm("确定要断开连接并退出吗？")) {
        if (ably) ably.close();
        showToast("已断开连接");
        setTimeout(() => window.location.reload(), 1000);
    }
}

// 在原有变量定义处增加昵称变量
let myNickname = localStorage.getItem('chat-nickname') || myId;
currentView = 'lobby'; 

/**
 * 修改用户名称
 */
async function setMyName() {
    const newName = prompt("请输入你的新名称:", myNickname);
    if (!newName || newName.trim() === "") return;

    myNickname = newName.trim();
    localStorage.setItem('chat-nickname', myNickname); // 持久化存储

    // 关键：更新 Presence 数据，Ably 会自动广播给所有在线用户
    if (lobbyChannel) {
        const currentData = (await lobbyChannel.presence.get({ clientId: myId }))[0]?.data || {};
        await lobbyChannel.presence.update({
            ...currentData,
            nickname: myNickname
        });
    }
    
    showToast(`名称已更新为: ${myNickname}`);
    
    // 如果当前在成员列表视图，立即刷新
    if (currentView === 'group') showGroupView();
}

/**
 * 切换到成员列表视图
 */
function showGroupView() {
    currentView = 'group';
    document.querySelector('.title-large').textContent = "在线成员";
    document.querySelector('.input-area').style.visibility = 'hidden';

    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-group').classList.add('active');

    renderMemberList();
}

/**
 * 渲染成员列表
 */
function renderMemberList() {
    if (!lobbyChannel || currentView !== 'group') return;

    lobbyChannel.presence.get((err, members) => {
        if (err) return;

        const container = document.getElementById('message-container');
        container.innerHTML = '';

        members.forEach(member => {
            const data = member.data || {};
            const displayName = data.nickname || member.clientId;
            const location = data.roomTitle || "闲逛中";

            const card = document.createElement('div');
            card.className = 'member-card';
            card.innerHTML = `
                <div class="member-avatar">${displayName.charAt(0).toUpperCase()}</div>
                <div class="member-info">
                    <div class="member-name">${displayName} ${member.clientId === myId ? '(我)' : ''}</div>
                    <div class="member-status">当前位置: ${location}</div>
                </div>
                <span class="material-symbols-rounded" style="color:#34a853; font-size:18px;">fiber_manual_record</span>
            `;
            container.appendChild(card);
        });
    });
}

// --- 更新原有的 initApp 中的进入逻辑 ---
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

        // 订阅大厅内所有成员的变动
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], () => {
            if (currentView === 'lobby') fetchAndRenderRooms();
            if (currentView === 'group') renderMemberList();
            updateOnlineDisplay();
        });

        // 初始进入大厅时带上昵称
        await lobbyChannel.presence.enter({ 
            currentRoom: 'Lobby',
            roomTitle: '公共大厅',
            nickname: myNickname // 发送初始昵称
        });

        showToast("服务连接成功");
        goToLobby();

    } catch (err) {
        console.error("Critical Error:", err);
        showToast("连接失败");
    }
}

// --- 事件绑定补充 ---
document.getElementById('nav-group').onclick = showGroupView;
document.getElementById('set-name-btn').onclick = setMyName;

// 修改原有 renderMessage 以显示自定义昵称
function renderMessage(msgObj, isMe) {
    if (currentView !== 'chat') return;

    const container = document.getElementById('message-container');
    const { text, sender, nickname } = msgObj.data; // 假设发送消息时也带上昵称

    const msgBubble = document.createElement('div');
    msgBubble.className = `msg-bubble ${isMe ? 'is-me' : ''}`;
    
    // 优先显示昵称，没有则显示 ID
    const senderDisplay = isMe ? '我' : (nickname || sender);

    msgBubble.innerHTML = `
        <div class="sender-name">${senderDisplay}</div>
        <div class="msg-content">${text}</div>
    `;

    container.appendChild(msgBubble);
    container.scrollTop = container.scrollHeight;
}

// 修改原有 sendMessage 以包含昵称
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text || !currentChatChannel) return;

    await currentChatChannel.publish('chat-msg', {
        text: text,
        sender: myId,
        nickname: myNickname // 发送消息时带上当前昵称
    });

    renderMessage({ data: { text, sender: myId, nickname: myNickname } }, true);
    input.value = '';
}

// 启动初始化
initApp();

// --- 5. 事件绑定 ---

document.querySelector('.fab-btn').onclick = async () => {
    const name = prompt("请输入房间名称:");
    if (!name) return;
    const roomId = 'room-' + Date.now();
    await joinRoom(roomId, name);
};

document.getElementById('send-btn').onclick = sendMessage;
document.getElementById('chat-input').onkeydown = (e) => {
    if (e.key === 'Enter') sendMessage();
};

document.getElementById('nav-lobby').onclick = goToLobby;
document.getElementById('nav-logout').onclick = logout;

// 默认执行初始化
initApp();