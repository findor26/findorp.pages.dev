const myId = 'Findor-' + Math.random().toString(36).substring(7);
let myNickname = localStorage.getItem('chat-nickname') || myId; 
let ably = null;
let lobbyChannel = null;
let currentChatChannel = null;
let currentView = 'lobby'; // 视图状态：'lobby', 'chat', 'group'

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
            echoMessages: false // 不接收自己发出的实时回显，手动渲染以获得更好体验
        });

        // 大厅频道：用于同步所有用户的在线状态和所在房间
        lobbyChannel = ably.channels.get('lobby');

        // 订阅大厅 Presence 变更
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], () => {
            if (currentView === 'lobby') {
                fetchAndRenderRooms();
            } else if (currentView === 'group') {
                renderMemberList();
            }
            updateOnlineDisplay();
        });

        // 初始进入大厅，上报昵称和默认位置
        await lobbyChannel.presence.enter({ 
            currentRoom: 'Lobby',
            roomTitle: '公共大厅',
            nickname: myNickname 
        });

        showToast("服务连接成功");
        goToLobby(); 

    } catch (err) {
        console.error("Critical Error:", err);
        showToast("系统连接异常，请检查配置");
    }
}

// --- 2. 视图切换逻辑 ---

/**
 * 切换到大厅：查看房间列表
 */
function goToLobby() {
    currentView = 'lobby';
    document.querySelector('.title-large').textContent = "频道大厅";
    document.querySelector('.input-area').style.visibility = 'hidden'; 
    
    // UI 激活状态切换
    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-lobby').classList.add('active');

    fetchAndRenderRooms();
}

/**
 * 切换到成员列表：查看谁在线
 */
function showGroupView() {
    currentView = 'group';
    document.querySelector('.title-large').textContent = "在线成员";
    document.querySelector('.input-area').style.visibility = 'hidden';

    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-group').classList.add('active');

    renderMemberList();
}

// --- 3. 渲染逻辑 ---

/**
 * 从大厅 Presence 获取数据并归类为房间
 */
async function fetchAndRenderRooms() {
    if (!lobbyChannel || currentView !== 'lobby') return;

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

        updateRoomUI(Array.from(roomsMap.values()));
    });
}

function updateRoomUI(rooms) {
    const container = document.getElementById('message-container');
    container.innerHTML = '';

    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-card';
        item.onclick = () => joinRoom(room.id, room.name);
        item.innerHTML = `
            <div class="room-lead"><span class="material-symbols-rounded">groups</span></div>
            <div class="room-content">
                <div class="room-title">${room.name}</div>
                <div class="room-meta">${room.members} 用户在线</div>
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
            const displayName = data.nickname || member.clientId;
            const location = data.roomTitle || "大厅";

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

function updateOnlineDisplay() {
    lobbyChannel.presence.get((err, members) => {
        if (!err) document.getElementById('online-count').textContent = members.length;
    });
}

// --- 4. 聊天与历史记录逻辑 ---

/**
 * 加载频道历史记录 (需在 Ably 后台开启 Persist messages)
 */
async function loadChatHistory(channel) {
    try {
        // limit: 50 表示获取最近的50条
        channel.history({ limit: 50 }, (err, resultPage) => {
            if (err) {
                console.warn("历史记录加载受限:", err);
                return;
            }
            
            // Ably 历史记录默认从新到旧，需反转以符合阅读顺序
            const messages = resultPage.items.reverse();
            messages.forEach(msg => {
                // 如果消息是自己发的，标记为 isMe
                const isMe = msg.clientId === myId;
                renderMessage(msg, isMe);
            });

            if (messages.length > 0) {
                showToast(`已回溯 ${messages.length} 条历史消息`);
            }
        });
    } catch (e) {
        console.error("History fetch error:", e);
    }
}

/**
 * 加入房间
 */
async function joinRoom(id, name) {
    currentView = 'chat';
    
    // 1. 如果已有频道，先取消订阅
    if (currentChatChannel) {
        currentChatChannel.unsubscribe();
    }

    // 2. 更新在大厅的位置和昵称信息
    await lobbyChannel.presence.update({
        currentRoom: id,
        roomTitle: name,
        nickname: myNickname
    });

    // 3. 获取并订阅新房间频道
    currentChatChannel = ably.channels.get(`chat:${id}`);
    
    // UI 状态清理
    document.querySelector('.title-large').textContent = name;
    document.getElementById('message-container').innerHTML = ''; 
    document.querySelector('.input-area').style.visibility = 'visible';
    
    document.querySelectorAll('.nav-icons .material-symbols-rounded').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-chat').classList.add('active');

    // 4. 首先加载历史记录
    loadChatHistory(currentChatChannel);

    // 5. 然后订阅实时消息
    currentChatChannel.subscribe('chat-msg', (msg) => {
        renderMessage(msg, false); 
    });

    showToast(`进入房间: ${name}`);
}

/**
 * 发送消息
 */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text || !currentChatChannel) return;

    // 发布消息，带上当前昵称
    await currentChatChannel.publish('chat-msg', {
        text: text,
        sender: myId,
        nickname: myNickname
    });

    // 立即在本地显示
    renderMessage({ data: { text, sender: myId, nickname: myNickname } }, true);
    input.value = '';
}

/**
 * 渲染单条消息
 */
function renderMessage(msgObj, isMe) {
    if (currentView !== 'chat') return; 

    const container = document.getElementById('message-container');
    const { text, sender, nickname } = msgObj.data;

    const msgBubble = document.createElement('div');
    msgBubble.className = `msg-bubble ${isMe ? 'is-me' : ''}`;
    
    const senderDisplay = isMe ? '我' : (nickname || sender);

    msgBubble.innerHTML = `
        <div class="sender-name">${senderDisplay}</div>
        <div class="msg-content">${text}</div>
    `;

    container.appendChild(msgBubble);
    container.scrollTop = container.scrollHeight;
}

// --- 5. 功能操作 ---

/**
 * 设置昵称
 */
async function setMyName() {
    const newName = prompt("请输入你的新名称:", myNickname);
    if (!newName || newName.trim() === "") return;

    myNickname = newName.trim();
    localStorage.setItem('chat-nickname', myNickname); 

    if (lobbyChannel) {
        // 获取当前 Presence 数据以保留 Room 信息，仅更新 Nickname
        const presenceItems = await lobbyChannel.presence.get({ clientId: myId });
        const currentData = presenceItems.length > 0 ? presenceItems[0].data : {};
        
        await lobbyChannel.presence.update({
            ...currentData,
            nickname: myNickname
        });
    }
    
    showToast(`名称更新为: ${myNickname}`);
    if (currentView === 'group') renderMemberList();
}

/**
 * 退出并刷新
 */
function logout() {
    if (confirm("确定断开连接吗？")) {
        if (ably) ably.close();
        window.location.reload();
    }
}

// --- 6. 事件绑定 ---

document.getElementById('nav-lobby').onclick = goToLobby;
document.getElementById('nav-group').onclick = showGroupView;
document.getElementById('nav-logout').onclick = logout;
document.getElementById('set-name-btn').onclick = setMyName;

document.getElementById('send-btn').onclick = sendMessage;
document.getElementById('chat-input').onkeydown = (e) => {
    if (e.key === 'Enter') sendMessage();
};

document.querySelector('.fab-btn').onclick = async () => {
    const name = prompt("房间名称:");
    if (name) {
        const roomId = 'room-' + Date.now();
        await joinRoom(roomId, name);
    }
};

// 执行程序启动
initApp();