/**
 * 核心变量初始化
 */
// 确保身份持久化，解决刷新后气泡颜色错误
const myId = localStorage.getItem('chat-user-id') || 'Findor-' + Math.random().toString(36).substring(7);
localStorage.setItem('chat-user-id', myId);

// 确保昵称持久化
let myNickname = localStorage.getItem('chat-nickname') || myId;
let ably = null;
let lobbyChannel = null;
let currentChatChannel = null;
let currentView = 'lobby'; // 可选值: lobby, chat, group
let currentRoomId = 'Lobby';
let currentRoomTitle = '公共大厅';

/**
 * 消息提醒工具 (Toast)
 */
function showToast(message) {
    const toast = document.getElementById('md3-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

/**
 * 核心初始化：建立 Ably 连接并进入大厅
 */
async function initApp() {
    try {
        // 从后端获取 API KEY
        const response = await fetch('/api/auth');
        if (!response.ok) throw new Error("无法获取认证令牌");
        const apiKey = await response.text();

        // 实例化 Ably
        ably = new Ably.Realtime({
            key: apiKey.trim(),
            clientId: myId,
            echoMessages: false // 禁止接收自己发出的消息（为了本地即时渲染）
        });

        // 绑定大厅频道
        lobbyChannel = ably.channels.get('lobby');

        // 订阅大厅 Presence 事件：成员进入、离开、更新（包含位置和昵称同步）
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], (member) => {
            console.log("成员变动:", member.action, member.clientId);
            
            // 实时刷新在线人数计数
            updateOnlineCounter();

            // 根据当前视图刷新 UI
            if (currentView === 'lobby') {
                renderRoomsFromPresence();
            } else if (currentView === 'group') {
                renderFullMemberList();
            }
        });

        // 正式进入大厅，同步我的初始状态
        await lobbyChannel.presence.enter({
            currentRoom: currentRoomId,
            roomTitle: currentRoomTitle,
            nickname: myNickname
        });

        showToast("系统已连接，同步中...");
        switchToLobbyView();

    } catch (err) {
        console.error("初始化失败:", err);
        showToast("连接失败，请检查网络或配置");
    }
}

/**
 * 视图切换：大厅 (Lobby)
 */
function switchToLobbyView() {
    currentView = 'lobby';
    document.getElementById('current-view-title').textContent = "频道大厅";
    document.getElementById('current-view-subtitle').textContent = "发现活跃的讨论组";
    document.getElementById('chat-input-zone').style.display = 'none';

    // 更新导航高亮
    updateNavUI('btn-nav-lobby');
    
    // 执行渲染
    renderRoomsFromPresence();
}

/**
 * 视图切换：在线成员 (Group)
 */
function switchToGroupView() {
    currentView = 'group';
    document.getElementById('current-view-title').textContent = "在线成员";
    document.getElementById('current-view-subtitle').textContent = "当前所有在线的用户";
    document.getElementById('chat-input-zone').style.display = 'none';

    updateNavUI('btn-nav-group');
    renderFullMemberList();
}

/**
 * 更新导航栏 UI 状态
 */
function updateNavUI(activeId) {
    const items = ['btn-nav-lobby', 'btn-nav-chat', 'btn-nav-group'];
    items.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === activeId) el.classList.add('active');
            else el.classList.remove('active');
        }
    });
}

/**
 * 逻辑：从 Presence 数据中提取并渲染房间列表
 */
async function renderRoomsFromPresence() {
    if (!lobbyChannel || currentView !== 'lobby') return;

    lobbyChannel.presence.get((err, members) => {
        if (err) return console.error("获取 Presence 失败:", err);

        const container = document.getElementById('message-container');
        container.innerHTML = '';

        // 按房间 ID 归类成员
        const rooms = new Map();
        members.forEach(m => {
            const rId = m.data.currentRoom || 'Lobby';
            const rTitle = m.data.roomTitle || '公共频道';
            if (!rooms.has(rId)) {
                rooms.set(rId, { id: rId, title: rTitle, users: [] });
            }
            rooms.get(rId).users.push(m);
        });

        // 渲染房间卡片
        rooms.forEach(room => {
            const card = document.createElement('div');
            card.className = 'room-card';
            card.onclick = () => enterChatRoom(room.id, room.title);
            card.innerHTML = `
                <span class="material-symbols-rounded" style="font-size: 32px; color: var(--md-sys-color-primary);">forum</span>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${room.title}</div>
                    <div style="font-size: 12px; opacity: 0.6;">${room.users.length} 名成员正在讨论</div>
                </div>
                <span class="material-symbols-rounded">arrow_forward_ios</span>
            `;
            container.appendChild(card);
        });
    });
}

/**
 * 逻辑：渲染完整的在线成员列表
 */
function renderFullMemberList() {
    if (!lobbyChannel || currentView !== 'group') return;

    lobbyChannel.presence.get((err, members) => {
        if (err) return;
        const container = document.getElementById('message-container');
        container.innerHTML = '';

        members.forEach(member => {
            const name = member.data.nickname || member.clientId;
            const pos = member.data.roomTitle || "未知位置";
            const isMe = member.clientId === myId;

            const item = document.createElement('div');
            item.className = 'member-item';
            item.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #ddd; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${name.charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${name} ${isMe ? '<small>(你)</small>' : ''}</div>
                    <div style="font-size: 12px; opacity: 0.6;">正在: ${pos}</div>
                </div>
                <div class="status-dot"></div>
            `;
            container.appendChild(item);
        });
    });
}

/**
 * 逻辑：进入聊天室
 */
async function enterChatRoom(roomId, roomTitle) {
    currentView = 'chat';
    currentRoomId = roomId;
    currentRoomTitle = roomTitle;

    // 1. 切换订阅频道
    if (currentChatChannel) {
        currentChatChannel.unsubscribe();
    }
    currentChatChannel = ably.channels.get(`chat:${roomId}`);

    // 2. 更新我在大厅中的位置状态
    await lobbyChannel.presence.update({
        currentRoom: roomId,
        roomTitle: roomTitle,
        nickname: myNickname
    });

    // 3. UI 切换
    document.getElementById('current-view-title').textContent = roomTitle;
    document.getElementById('current-view-subtitle').textContent = "实时对话已加密";
    document.getElementById('message-container').innerHTML = '';
    document.getElementById('chat-input-zone').style.display = 'block';
    updateNavUI('btn-nav-chat');

    // 4. 加载历史记录 (History) - 解决刷新记录消失问题
    loadRoomHistory();

    // 5. 订阅实时消息流
    currentChatChannel.subscribe('chat-msg', (msg) => {
        processIncomingMessage(msg, false);
    });

    // 6. 订阅撤回指令流
    currentChatChannel.subscribe('recall-msg', (msg) => {
        executeRecallUI(msg.data.msgId, msg.data.nickname);
    });

    showToast(`欢迎进入 ${roomTitle}`);
}

/**
 * 历史记录加载逻辑
 */
function loadRoomHistory() {
    if (!currentChatChannel) return;

    currentChatChannel.history({ limit: 50 }, (err, resultPage) => {
        if (err) return console.warn("无法加载历史记录:", err);
        
        // 历史消息是由新到旧排列的，需反转
        const messages = resultPage.items.reverse();
        messages.forEach(msg => {
            // 处理历史中的撤回记录
            if (msg.name === 'recall-msg') {
                executeRecallUI(msg.data.msgId, msg.data.nickname);
            } else if (msg.name === 'chat-msg') {
                processIncomingMessage(msg, msg.clientId === myId);
            }
        });
    });
}

/**
 * 发送消息逻辑
 */
async function handleSendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentChatChannel) return;

    // 生成消息唯一 ID 用于撤回
    const msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).substring(7);

    const payload = {
        msgId: msgId,
        text: text,
        nickname: myNickname,
        timestamp: Date.now()
    };

    // 发送消息
    try {
        await currentChatChannel.publish('chat-msg', payload);
        // 本地立即渲染
        processIncomingMessage({ data: payload, clientId: myId }, true);
        input.value = '';
    } catch (e) {
        showToast("消息发送失败");
    }
}

/**
 * 渲染消息 UI 逻辑
 */
function processIncomingMessage(msg, isMe) {
    const container = document.getElementById('message-container');
    const data = msg.data;

    // 避免重复渲染（如果历史记录和实时流撞车）
    if (document.querySelector(`[data-id="${data.msgId}"]`)) return;

    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isMe ? 'is-me' : ''}`;
    wrapper.setAttribute('data-id', data.msgId);

    const senderName = isMe ? "你" : data.nickname;

    wrapper.innerHTML = `
        <div class="sender-meta">${senderName} • ${new Date(data.timestamp || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        <div class="msg-bubble">${data.text}</div>
        ${isMe ? `<button class="recall-action" onclick="requestRecall('${data.msgId}')">撤回消息</button>` : ''}
    `;

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

/**
 * 执行撤回操作：发送指令
 */
async function requestRecall(msgId) {
    if (!currentChatChannel) return;
    if (confirm("确定撤回这条消息吗？")) {
        await currentChatChannel.publish('recall-msg', {
            msgId: msgId,
            nickname: myNickname
        });
    }
}

/**
 * 处理撤回 UI 的执行：将消息气泡替换为提示
 */
function executeRecallUI(msgId, nickname) {
    const target = document.querySelector(`[data-id="${msgId}"]`);
    if (target) {
        const notice = document.createElement('div');
        notice.className = 'recall-notice';
        notice.textContent = `${nickname} 撤回了一条消息`;
        target.parentNode.replaceChild(notice, target);
    }
}

/**
 * 设置昵称逻辑
 */
async function handleUpdateNickname() {
    const newName = prompt("请输入新的聊天昵称:", myNickname);
    if (!newName || newName.trim() === "") return;

    myNickname = newName.trim();
    localStorage.setItem('chat-nickname', myNickname);

    // 同步到 Presence 全网
    if (lobbyChannel) {
        await lobbyChannel.presence.update({
            currentRoom: currentRoomId,
            roomTitle: currentRoomTitle,
            nickname: myNickname
        });
    }

    showToast("昵称已同步");
    if (currentView === 'group') renderFullMemberList();
}

/**
 * 更新在线统计
 */
function updateOnlineCounter() {
    if (!lobbyChannel) return;
    lobbyChannel.presence.get((err, members) => {
        if (!err) {
            document.getElementById('online-count').textContent = members.length;
        }
    });
}

/**
 * 事件监听绑定
 */
document.getElementById('btn-nav-lobby').onclick = switchToLobbyView;
document.getElementById('btn-nav-group').onclick = switchToGroupView;
document.getElementById('send-btn').onclick = handleSendMessage;
document.getElementById('chat-input').onkeydown = (e) => { if (e.key === 'Enter') handleSendMessage(); };
document.getElementById('set-name-btn').onclick = handleUpdateNickname;

document.getElementById('btn-nav-logout').onclick = () => {
    if (confirm("确定要断开连接吗？")) {
        localStorage.removeItem('chat-user-id');
        localStorage.removeItem('chat-nickname');
        if (ably) ably.close();
        location.reload();
    }
};

document.getElementById('create-room-fab').onclick = () => {
    const name = prompt("输入新房间的名称:");
    if (name) {
        const id = 'room-' + Date.now();
        enterChatRoom(id, name);
    }
};

// 启动程序
initApp();