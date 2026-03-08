/**
 * ==========================================
 * 1. 核心状态与全局变量 (绝不精简)
 * ==========================================
 */

// 锁定 clientId，防止刷新后 ID 变更导致自己发的消息变色
const myId = localStorage.getItem('chat-user-id') || 'Findor-' + Math.random().toString(36).substring(7);
localStorage.setItem('chat-user-id', myId);

// 锁定昵称
let myNickname = localStorage.getItem('chat-nickname') || myId;

// Ably 实例与频道句柄
let ably = null;
let lobbyChannel = null;
let currentChatChannel = null;

// 视图状态控制
let currentView = 'lobby'; // 'lobby' | 'chat' | 'group'
let currentRoomId = 'Lobby';
let currentRoomTitle = '公共大厅';

/**
 * ==========================================
 * 2. 基础 UI 工具函数
 * ==========================================
 */

function showToast(message) {
    const toast = document.getElementById('md3-toast');
    if (toast) {
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(function() {
            toast.style.display = 'none';
        }, 3000);
    }
}

function updateNavUI(activeId) {
    const navItems = ['btn-nav-lobby', 'btn-nav-chat', 'btn-nav-group'];
    for (let i = 0; i < navItems.length; i++) {
        const item = document.getElementById(navItems[i]);
        if (item) {
            if (navItems[i] === activeId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        }
    }
}

/**
 * ==========================================
 * 3. 初始化与 Presence 监听
 * ==========================================
 */

async function initApp() {
    try {
        // 获取 API 密钥
        const response = await fetch('/api/auth');
        if (response.ok === false) {
            throw new Error("API 认证失败");
        }
        const apiKey = await response.text();

        // 连接 Ably
        ably = new Ably.Realtime({
            key: apiKey.trim(),
            clientId: myId,
            echoMessages: false // 必须为 false，否则实时订阅会和本地渲染冲突
        });

        // 订阅大厅频道用于 Presence 状态同步
        lobbyChannel = ably.channels.get('lobby');

        // 监听全局在线状态，驱动大厅和成员列表实时更新
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], function(member) {
            console.log("在线状态变更: ", member.action);
            
            // 每次有人变动，更新全局人数
            updateOnlineCounter();

            // 根据当前视图刷新列表内容
            if (currentView === 'lobby') {
                renderRoomsFromPresence();
            } else if (currentView === 'group') {
                renderFullMemberList();
            }
        });

        // 首次进入：上报我的状态
        await lobbyChannel.presence.enter({
            currentRoom: currentRoomId,
            roomTitle: currentRoomTitle,
            nickname: myNickname
        });

        showToast("在线连接已建立");
        switchToLobbyView();

    } catch (err) {
        console.error("初始化错误: ", err);
        showToast("连接异常，请刷新重试");
    }
}

/**
 * ==========================================
 * 4. 大厅与成员列表逻辑 (大厅内容核心)
 * ==========================================
 */

function switchToLobbyView() {
    currentView = 'lobby';
    document.getElementById('current-view-title').textContent = "频道大厅";
    document.getElementById('current-view-subtitle').textContent = "发现活跃的讨论组";
    document.getElementById('chat-input-zone').style.display = 'none';
    
    updateNavUI('btn-nav-lobby');
    renderRoomsFromPresence();
}

async function renderRoomsFromPresence() {
    if (lobbyChannel === null || currentView !== 'lobby') {
        return;
    }

    lobbyChannel.presence.get(function(err, members) {
        if (err) {
            console.error("获取大厅列表失败: ", err);
            return;
        }

        const container = document.getElementById('message-container');
        container.innerHTML = ''; // 清空加载状态

        // 逻辑：通过 Presence 数据动态聚类房间
        const roomsMap = new Map();

        // 强制加入一个默认公共大厅，确保大厅不为空
        roomsMap.set('Lobby', {
            id: 'Lobby',
            title: '公共大厅',
            count: 0
        });

        for (let i = 0; i < members.length; i++) {
            const memberData = members[i].data || {};
            const rId = memberData.currentRoom || 'Lobby';
            const rTitle = memberData.roomTitle || '未知频道';

            if (roomsMap.has(rId) === false) {
                roomsMap.set(rId, {
                    id: rId,
                    title: rTitle,
                    count: 0
                });
            }
            const roomObj = roomsMap.get(rId);
            roomObj.count = roomObj.count + 1;
        }

        // 渲染 HTML
        roomsMap.forEach(function(room) {
            const roomCard = document.createElement('div');
            roomCard.className = 'room-card';
            roomCard.style.cssText = "display: flex; align-items: center; padding: 16px; margin-bottom: 12px; background: #f1f3f4; border-radius: 12px; cursor: pointer;";
            
            roomCard.onclick = function() {
                enterChatRoom(room.id, room.title);
            };

            roomCard.innerHTML = `
                <div style="background: var(--md-sys-color-primary); color: white; padding: 10px; border-radius: 12px; margin-right: 16px;">
                    <span class="material-symbols-rounded">groups</span>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 500; font-size: 16px;">${room.title}</div>
                    <div style="font-size: 12px; opacity: 0.6;">${room.count} 位用户在此频道</div>
                </div>
                <span class="material-symbols-rounded">chevron_right</span>
            `;
            container.appendChild(roomCard);
        });
    });
}

function switchToGroupView() {
    currentView = 'group';
    document.getElementById('current-view-title').textContent = "在线成员";
    document.getElementById('current-view-subtitle').textContent = "所有连接到服务器的用户";
    document.getElementById('chat-input-zone').style.display = 'none';

    updateNavUI('btn-nav-group');
    renderFullMemberList();
}

function renderFullMemberList() {
    if (lobbyChannel === null || currentView !== 'group') {
        return;
    }

    lobbyChannel.presence.get(function(err, members) {
        const container = document.getElementById('message-container');
        container.innerHTML = '';

        for (let i = 0; i < members.length; i++) {
            const m = members[i];
            const data = m.data || {};
            const nickname = data.nickname || m.clientId;
            const location = data.roomTitle || "大厅";

            const item = document.createElement('div');
            item.className = 'member-item';
            item.style.cssText = "display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #eee;";
            
            item.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #ccc; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold;">
                    ${nickname.charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${nickname} ${m.clientId === myId ? '(我)' : ''}</div>
                    <div style="font-size: 12px; opacity: 0.6;">所在频道: ${location}</div>
                </div>
                <div style="width: 8px; height: 8px; background: #34a853; border-radius: 50%;"></div>
            `;
            container.appendChild(item);
        }
    });
}

/**
 * ==========================================
 * 5. 聊天室核心逻辑 (撤回、历史、发送)
 * ==========================================
 */

async function enterChatRoom(roomId, roomTitle) {
    currentView = 'chat';
    currentRoomId = roomId;
    currentRoomTitle = roomTitle;

    // 切换 Ably 频道订阅
    if (currentChatChannel !== null) {
        currentChatChannel.unsubscribe();
    }
    currentChatChannel = ably.channels.get(`chat:${roomId}`);

    // 更新 Presence 状态，同步位置
    await lobbyChannel.presence.update({
        currentRoom: roomId,
        roomTitle: roomTitle,
        nickname: myNickname
    });

    // UI 清理
    document.getElementById('current-view-title').textContent = roomTitle;
    document.getElementById('message-container').innerHTML = '';
    document.getElementById('chat-input-zone').style.display = 'block';
    updateNavUI('btn-nav-chat');

    // 1. 回溯加载历史记录
    loadChatHistory();

    // 2. 订阅实时聊天消息
    currentChatChannel.subscribe('chat-msg', function(msg) {
        renderSingleMessage(msg, false);
    });

    // 3. 订阅撤回指令
    currentChatChannel.subscribe('recall-msg', function(msg) {
        applyRecallToUI(msg.data.msgId, msg.data.nickname);
    });

    showToast(`欢迎来到 ${roomTitle}`);
}

function loadChatHistory() {
    if (currentChatChannel === null) return;

    currentChatChannel.history({ limit: 50 }, function(err, resultPage) {
        if (err) {
            console.warn("历史回溯受限: ", err);
            return;
        }

        const historyItems = resultPage.items.reverse();
        for (let i = 0; i < historyItems.length; i++) {
            const item = historyItems[i];
            if (item.name === 'recall-msg') {
                applyRecallToUI(item.data.msgId, item.data.nickname);
            } else {
                renderSingleMessage(item, item.clientId === myId);
            }
        }
    });
}

async function handleSendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (text === "" || currentChatChannel === null) {
        return;
    }

    // 生成消息唯一识别符用于撤回
    const uniqueMsgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(7);

    const payload = {
        msgId: uniqueMsgId,
        text: text,
        nickname: myNickname,
        timestamp: Date.now()
    };

    try {
        await currentChatChannel.publish('chat-msg', payload);
        // 本地立即渲染（因为 echoMessages 为 false）
        renderSingleMessage({ data: payload, clientId: myId }, true);
        input.value = '';
    } catch (e) {
        showToast("消息发送失败");
    }
}

function renderSingleMessage(msgObj, isMe) {
    if (currentView !== 'chat') return;
    
    const container = document.getElementById('message-container');
    const data = msgObj.data;

    // 防止历史记录与实时消息冲突导致的重复渲染
    if (document.querySelector(`[data-msg-id="${data.msgId}"]`)) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = isMe ? 'msg-wrapper is-me' : 'msg-wrapper';
    wrapper.setAttribute('data-msg-id', data.msgId);
    wrapper.style.cssText = `display: flex; flex-direction: column; margin-bottom: 12px; ${isMe ? 'align-items: flex-end;' : 'align-items: flex-start;'}`;

    const senderLabel = isMe ? "你" : data.nickname;

    wrapper.innerHTML = `
        <div style="font-size: 11px; opacity: 0.6; margin-bottom: 4px;">${senderLabel}</div>
        <div class="msg-bubble" style="
            max-width: 80%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 15px;
            line-height: 1.4;
            background: ${isMe ? 'var(--md-sys-color-primary)' : '#e0e2ec'};
            color: ${isMe ? 'white' : 'black'};
        ">
            ${data.text}
        </div>
        ${isMe ? `<button class="recall-btn" style="border:none; background:none; color:blue; font-size:10px; cursor:pointer; margin-top:4px;" onclick="sendRecallRequest('${data.msgId}')">撤回</button>` : ''}
    `;

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

/**
 * ==========================================
 * 6. 撤回指令执行逻辑
 * ==========================================
 */

async function sendRecallRequest(msgId) {
    if (currentChatChannel === null) return;
    if (confirm("撤回此消息？")) {
        await currentChatChannel.publish('recall-msg', {
            msgId: msgId,
            nickname: myNickname
        });
    }
}

function applyRecallToUI(msgId, nickname) {
    const msgElement = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (msgElement) {
        const recallText = document.createElement('div');
        recallText.style.cssText = "font-size: 12px; font-style: italic; opacity: 0.5; padding: 8px; text-align: center; width: 100%;";
        recallText.textContent = nickname + " 撤回了一条消息";
        msgElement.parentNode.replaceChild(recallText, msgElement);
    }
}

/**
 * ==========================================
 * 7. 设置、退出与事件监听
 * ==========================================
 */

async function changeNickname() {
    const n = prompt("输入新昵称:", myNickname);
    if (n && n.trim() !== "") {
        myNickname = n.trim();
        localStorage.setItem('chat-nickname', myNickname);
        
        // 同步到 Presence
        if (lobbyChannel) {
            await lobbyChannel.presence.update({
                currentRoom: currentRoomId,
                roomTitle: currentRoomTitle,
                nickname: myNickname
            });
        }
        showToast("昵称已更新");
        if (currentView === 'group') renderFullMemberList();
    }
}

function updateOnlineCounter() {
    if (lobbyChannel) {
        lobbyChannel.presence.get(function(err, m) {
            if (!err) document.getElementById('online-count').textContent = m.length;
        });
    }
}

// 事件绑定
document.getElementById('btn-nav-lobby').onclick = switchToLobbyView;
document.getElementById('btn-nav-group').onclick = switchToGroupView;
document.getElementById('send-btn').onclick = handleSendMessage;
document.getElementById('set-name-btn').onclick = changeNickname;

document.getElementById('chat-input').onkeydown = function(e) {
    if (e.key === 'Enter') handleSendMessage();
};

document.getElementById('create-room-fab').onclick = function() {
    const roomName = prompt("新房间名称:");
    if (roomName) {
        enterChatRoom('r-' + Date.now(), roomName);
    }
};

document.getElementById('btn-nav-logout').onclick = function() {
    if (confirm("确定断开连接并注销身份吗？")) {
        localStorage.clear();
        if (ably) ably.close();
        location.reload();
    }
};

// 启动应用
initApp();