const myId = 'Findor-' + Math.random().toString(36).substring(7);
let myNickname = localStorage.getItem('chat-nickname') || myId; // 从本地存储获取昵称
let ably = null;
let lobbyChannel = null;
let currentChatChannel = null;
let currentView = 'lobby'; // 标记当前活跃视图

/**
 * MD3 风格的 Snackbar (Toast) 提示
 * @param {string} message 提示内容
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
    
    // 3秒后自动隐藏
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

// --- 1. 初始化应用 ---
async function initApp() {
    try {
        const response = await fetch('/api/auth'); // 获取 API Key
        if (!response.ok) throw new Error("Auth failed");
        const apiKey = await response.text();
        
        // 生产环境配置：启用状态恢复与心跳检测
        ably = new Ably.Realtime({ 
            key: apiKey.trim(), 
            clientId: myId,
            echoMessages: false 
        });

        lobbyChannel = ably.channels.get('lobby');

        // 订阅大厅内所有成员的进入、离开、更新事件
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], () => {
            // 根据当前视图刷新对应 UI
            if (currentView === 'lobby') {
                fetchAndRenderRooms();
            } else if (currentView === 'group') {
                renderMemberList();
            }
            updateOnlineDisplay();
        });

        // 初始进入大厅，带上初始昵称和位置
        await lobbyChannel.presence.enter({ 
            currentRoom: 'Lobby',
            roomTitle: '公共大厅',
            nickname: myNickname 
        });

        showToast("服务连接成功");
        goToLobby(); // 默认显示大厅

    } catch (err) {
        console.error("Critical Error:", err);
        showToast("系统连接异常，请检查 API 配置");
    }
}

// --- 2. 视图切换逻辑 ---

/**
 * 切换到大厅视图
 */
function goToLobby() {
    currentView = 'lobby';
    document.querySelector('.title-large').textContent = "频道大厅";
    document.querySelector('.input-area').style.visibility = 'hidden'; // 大厅隐藏输入框
    
    // 更新导航图标激活状态
    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-lobby').classList.add('active');

    fetchAndRenderRooms();
}

/**
 * 切换到成员列表视图
 */
function showGroupView() {
    currentView = 'group';
    document.querySelector('.title-large').textContent = "在线成员";
    document.querySelector('.input-area').style.visibility = 'hidden';

    // 更新导航图标激活状态
    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-group').classList.add('active');

    renderMemberList();
}

// --- 3. 数据渲染逻辑 ---

/**
 * 获取并渲染房间列表
 */
async function fetchAndRenderRooms() {
    if (!lobbyChannel || currentView !== 'lobby') return;

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
            const displayName = data.nickname || member.clientId; // 优先显示昵称
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

/**
 * 更新在线人数计数器
 */
function updateOnlineDisplay() {
    lobbyChannel.presence.get((err, members) => {
        if (!err) {
            document.getElementById('online-count').textContent = members.length;
        }
    });
}

// --- 4. 聊天与消息逻辑 ---

/**
 * 加入特定聊天室
 */
async function joinRoom(id, name) {
    currentView = 'chat';
    
    // 1. 取消旧频道订阅
    if (currentChatChannel) {
        currentChatChannel.unsubscribe();
    }

    // 2. 更新在大厅的位置声明，包含昵称同步
    await lobbyChannel.presence.update({
        currentRoom: id,
        roomTitle: name,
        nickname: myNickname
    });

    // 3. 订阅新房间频道消息
    currentChatChannel = ably.channels.get(`chat:${id}`);
    currentChatChannel.subscribe('chat-msg', (msg) => {
        renderMessage(msg, false); // 接收他人消息
    });

    // 4. UI 准备
    document.querySelector('.title-large').textContent = name;
    document.getElementById('message-container').innerHTML = ''; 
    document.querySelector('.input-area').style.visibility = 'visible';
    
    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-chat').classList.add('active');

    showToast(`已进入: ${name}`);
}

/**
 * 发送消息
 */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text || !currentChatChannel) return;

    // 发布消息，携带昵称
    await currentChatChannel.publish('chat-msg', {
        text: text,
        sender: myId,
        nickname: myNickname
    });

    // 本地即时渲染
    renderMessage({ data: { text, sender: myId, nickname: myNickname } }, true);
    input.value = '';
}

/**
 * 渲染单条消息气泡
 */
function renderMessage(msgObj, isMe) {
    if (currentView !== 'chat') return; 

    const container = document.getElementById('message-container');
    const { text, sender, nickname } = msgObj.data;

    const msgBubble = document.createElement('div');
    msgBubble.className = `msg-bubble ${isMe ? 'is-me' : ''}`;
    
    // 优先显示昵称
    const senderDisplay = isMe ? '我' : (nickname || sender);

    msgBubble.innerHTML = `
        <div class="sender-name">${senderDisplay}</div>
        <div class="msg-content">${text}</div>
    `;

    container.appendChild(msgBubble);
    // 自动滚动到底部
    container.scrollTop = container.scrollHeight;
}

// --- 5. 用户设置与功能操作 ---

/**
 * 修改用户名称
 */
async function setMyName() {
    const newName = prompt("请输入你的新名称:", myNickname);
    if (!newName || newName.trim() === "") return;

    myNickname = newName.trim();
    localStorage.setItem('chat-nickname', myNickname); // 持久化

    // 同步 Presence 数据到全网
    if (lobbyChannel) {
        const presenceInfo = await lobbyChannel.presence.get({ clientId: myId });
        const currentData = presenceInfo.length > 0 ? presenceInfo[0].data : {};
        
        await lobbyChannel.presence.update({
            ...currentData,
            nickname: myNickname
        });
    }
    
    showToast(`名称已更新为: ${myNickname}`);
    
    if (currentView === 'group') renderMemberList();
}

/**
 * 退出应用并断开 Ably 连接
 */
function logout() {
    if (confirm("确定要断开连接并退出吗？")) {
        if (ably) {
            ably.close(); // 彻底销毁实例
        }
        showToast("已断开连接");
        setTimeout(() => window.location.reload(), 1000);
    }
}

// --- 6. 事件监听绑定 ---

// 侧边栏按钮绑定
document.getElementById('nav-lobby').onclick = goToLobby;
document.getElementById('nav-group').onclick = showGroupView;
document.getElementById('nav-logout').onclick = logout;

// 顶部栏按钮绑定
document.getElementById('set-name-btn').onclick = setMyName;

// 输入与发送绑定
document.getElementById('send-btn').onclick = sendMessage;
document.getElementById('chat-input').onkeydown = (e) => {
    if (e.key === 'Enter') sendMessage();
};

// FAB 创建房间绑定
document.querySelector('.fab-btn').onclick = async () => {
    const name = prompt("请输入房间名称:");
    if (!name) return;
    const roomId = 'room-' + Date.now();
    await joinRoom(roomId, name);
};

// 启动程序
initApp();