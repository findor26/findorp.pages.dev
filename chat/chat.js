/**
 * ==========================================
 * 1. 核心状态与全局变量
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
let currentView = 'lobby'; // 可选值: 'lobby' | 'chat' | 'group'
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
        // 3秒后自动隐藏
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
        // 获取 API 密钥（假设后端提供 /api/auth 接口）
        const response = await fetch('/api/auth');
        if (response.ok === false) {
            throw new Error("API 认证失败，请检查后端配置");
        }
        const apiKey = await response.text();

        // 实例化 Ably
        ably = new Ably.Realtime({
            key: apiKey.trim(),
            clientId: myId,
            echoMessages: false // 必须为 false，否则实时订阅会和本地渲染冲突
        });

        // 订阅大厅频道用于 Presence 状态同步
        lobbyChannel = ably.channels.get('lobby');

        // 监听全局在线状态，驱动大厅和成员列表实时更新
        lobbyChannel.presence.subscribe(['enter', 'leave', 'update'], function(member) {
            console.log("在线状态变更动作: ", member.action);
            
            // 每次有人变动，更新全局人数计数器
            updateOnlineCounter();

            // 根据当前视图实时刷新列表内容
            if (currentView === 'lobby') {
                renderRoomsFromPresence();
            } else if (currentView === 'group') {
                renderFullMemberList();
            }
        });

        // 首次进入：上报我的当前状态
        await lobbyChannel.presence.enter({
            currentRoom: currentRoomId,
            roomTitle: currentRoomTitle,
            nickname: myNickname
        });

        showToast("在线连接已成功建立");
        switchToLobbyView();

    } catch (err) {
        console.error("初始化过程中发生错误: ", err);
        showToast("连接异常，请尝试刷新页面");
    }
}

/**
 * ==========================================
 * 4. 大厅视图逻辑
 * ==========================================
 */

function switchToLobbyView() {
    currentView = 'lobby';
    document.getElementById('current-view-title').textContent = "频道大厅";
    
    // 确保 subtitle 元素存在
    const subtitle = document.getElementById('current-view-subtitle');
    if (subtitle) {
        subtitle.textContent = "发现活跃的讨论组";
    }
    
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
        container.innerHTML = ''; // 清除加载占位符

        // 逻辑：通过 Presence 数据动态聚类房间信息
        const roomsMap = new Map();

        // 强制加入一个默认公共大厅，确保列表不为空
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

        // 渲染 HTML 卡片
        roomsMap.forEach(function(room) {
            const roomCard = document.createElement('div');
            roomCard.className = 'room-card';
            
            // 点击进入聊天室
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

/**
 * ==========================================
 * 5. 成员列表视图逻辑
 * ==========================================
 */

function switchToGroupView() {
    currentView = 'group';
    document.getElementById('current-view-title').textContent = "在线成员";
    
    const subtitle = document.getElementById('current-view-subtitle');
    if (subtitle) {
        subtitle.textContent = "所有已连接的用户";
    }
    
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
            const location = data.roomTitle || "正在切换...";

            const item = document.createElement('div');
            item.className = 'member-item';
            item.style.cssText = "display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #eee;";
            
            item.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #ccc; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold;">
                    ${nickname.charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${nickname} ${m.clientId === myId ? '(我)' : ''}</div>
                    <div style="font-size: 12px; opacity: 0.6;">当前位置: ${location}</div>
                </div>
                <div style="width: 8px; height: 8px; background: #34a853; border-radius: 50%;"></div>
            `;
            container.appendChild(item);
        }
    });
}

/**
 * ==========================================
 * 6. 聊天室核心逻辑 (撤回、历史回溯、发送)
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

    // 更新 Presence 状态，让全网知道我换了地方
    await lobbyChannel.presence.update({
        currentRoom: roomId,
        roomTitle: roomTitle,
        nickname: myNickname
    });

    // UI 状态切换
    document.getElementById('current-view-title').textContent = roomTitle;
    document.getElementById('message-container').innerHTML = '';
    document.getElementById('chat-input-zone').style.display = 'block';
    updateNavUI('btn-nav-chat');

    // 1. 加载频道历史记录
    loadChatHistory();

    // 2. 订阅实时聊天消息流
    currentChatChannel.subscribe('chat-msg', function(msg) {
        renderSingleMessage(msg, false);
    });

    // 3. 订阅撤回指令流
    currentChatChannel.subscribe('recall-msg', function(msg) {
        applyRecallToUI(msg.data.msgId, msg.data.nickname);
    });

    showToast(`欢迎进入 ${roomTitle}`);
}

function loadChatHistory() {
    if (currentChatChannel === null) return;

    currentChatChannel.history({ limit: 50 }, function(err, resultPage) {
        if (err) {
            console.warn("历史消息加载受限: ", err);
            return;
        }

        // Ably 历史默认由新到旧，需要反转以符合阅读顺序
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

    // 生成唯一识别符用于撤回控制
    const uniqueMsgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(7);

    const payload = {
        msgId: uniqueMsgId,
        text: text,
        nickname: myNickname,
        timestamp: Date.now()
    };

    try {
        await currentChatChannel.publish('chat-msg', payload);
        // 本地渲染自己的消息（由于 echoMessages 为 false，需手动执行一次）
        renderSingleMessage({ data: payload, clientId: myId }, true);
        input.value = '';
    } catch (e) {
        showToast("消息发送失败，请检查网络");
    }
}

function renderSingleMessage(msgObj, isMe) {
    if (currentView !== 'chat') return;
    
    const container = document.getElementById('message-container');
    const data = msgObj.data;

    // 防止历史回溯与实时推送重复渲染
    if (document.querySelector(`[data-msg-id="${data.msgId}"]`)) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = isMe ? 'msg-wrapper is-me' : 'msg-wrapper';
    wrapper.setAttribute('data-msg-id', data.msgId);
    
    // 手动指定布局样式确保对齐正确
    wrapper.style.cssText = `display: flex; flex-direction: column; margin-bottom: 12px; ${isMe ? 'align-items: flex-end;' : 'align-items: flex-start;'}`;

    const senderLabel = isMe ? "你" : data.nickname;

    wrapper.innerHTML = `
        <div style="font-size: 11px; opacity: 0.6; margin-bottom: 4px;">${senderLabel}</div>
        <div class="msg-bubble">
            ${data.text}
        </div>
        ${isMe ? `<button class="recall-btn" onclick="sendRecallRequest('${data.msgId}')">撤回</button>` : ''}
    `;

    container.appendChild(wrapper);
    // 自动滚动到底部
    container.scrollTop = container.scrollHeight;
}

/**
 * ==========================================
 * 7. 撤回业务逻辑
 * ==========================================
 */

async function sendRecallRequest(msgId) {
    if (currentChatChannel === null) return;
    if (confirm("确定要撤回这条消息吗？")) {
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
        
        // 用撤回提示替换原始消息节点
        if (msgElement.parentNode) {
            msgElement.parentNode.replaceChild(recallText, msgElement);
        }
    }
}

/**
 * ==========================================
 * 8. 系统设置、退出与事件绑定
 * ==========================================
 */

/**
 * ==========================================
 * 8. 用户操作与系统事件 (已更新为 MD3 弹窗逻辑)
 * ==========================================
 */

const nickDialog = document.getElementById('nickname-dialog-overlay');
const nickInput = document.getElementById('new-nickname-input');

// 打开弹窗
async function openNicknameDialog() {
    nickInput.value = myNickname; // 预填充当前昵称
    nickDialog.style.display = 'flex';
    nickInput.focus();
}

// 关闭弹窗
function closeNicknameDialog() {
    nickDialog.style.display = 'none';
}

// 确认修改逻辑
async function handleConfirmNickname() {
    const newName = nickInput.value.trim();
    
    if (newName !== "" && newName !== myNickname) {
        myNickname = newName;
        localStorage.setItem('chat-nickname', myNickname);
        
        // 实时同步 Presence 状态
        if (lobbyChannel) {
            await lobbyChannel.presence.update({
                currentRoom: currentRoomId,
                roomTitle: currentRoomTitle,
                nickname: myNickname
            });
        }
        
        showToast("昵称已成功更新");
        
        // 刷新列表视图
        if (currentView === 'group') {
            renderFullMemberList();
        }
    }
    closeNicknameDialog();
}

// 事件监听绑定更新
document.getElementById('set-name-btn').onclick = openNicknameDialog;
document.getElementById('dialog-cancel-btn').onclick = closeNicknameDialog;
document.getElementById('dialog-confirm-btn').onclick = handleConfirmNickname;

// 增强体验：点击遮罩层关闭，回车键确认
nickDialog.onclick = (e) => {
    if (e.target === nickDialog) closeNicknameDialog();
};

nickInput.onkeydown = (e) => {
    if (e.key === 'Enter') handleConfirmNickname();
    if (e.key === 'Escape') closeNicknameDialog();
};

function updateOnlineCounter() {
    if (lobbyChannel) {
        lobbyChannel.presence.get(function(err, members) {
            if (!err) {
                document.getElementById('online-count').textContent = members.length;
            }
        });
    }
}

// 侧边栏视图切换绑定
document.getElementById('btn-nav-lobby').onclick = switchToLobbyView;
document.getElementById('btn-nav-group').onclick = switchToGroupView;

// 发送逻辑绑定
document.getElementById('send-btn').onclick = handleSendMessage;
document.getElementById('chat-input').onkeydown = function(e) {
    if (e.key === 'Enter') {
        handleSendMessage();
    }
};

// 昵称修改绑定
document.getElementById('set-name-btn').onclick = changeNickname;

// 创建房间逻辑绑定
document.getElementById('create-room-fab').onclick = function() {
    const roomName = prompt("请输入新房间名称:");
    if (roomName && roomName.trim() !== "") {
        // 生成临时唯一的房间 ID
        enterChatRoom('r-' + Date.now(), roomName.trim());
    }
};

// 退出注销逻辑绑定
document.getElementById('btn-nav-logout').onclick = function() {
    if (confirm("确定要断开连接并注销当前身份吗？")) {
        localStorage.clear();
        if (ably) {
            ably.close();
        }
        location.reload();
    }
};

/**
 * ==========================================
 * 9. 程序启动入口
 * ==========================================
 */
initApp();