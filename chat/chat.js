const myId = 'Findor-' + Math.random().toString(36).substring(7);
let ably = null;
let lobbyChannel = null;

// --- 1. 正规化初始化 ---
async function initApp() {
    try {
        const response = await fetch('/api/auth');
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
            fetchAndRenderRooms(); // 任何变动即刻刷新 UI
        });

        // 初始进入大厅，并在数据中声明自己当前所在的房间（默认为大厅）
        await lobbyChannel.presence.enter({ 
            currentRoom: 'Lobby',
            roomTitle: '公共大厅'
        });

        showToast("服务连接成功");
        fetchAndRenderRooms();

    } catch (err) {
        console.error("Critical Error:", err);
        showToast("系统连接异常，请检查 API 配置");
    }
}

// --- 2. 正规化数据同步 (非模拟) ---
async function fetchAndRenderRooms() {
    if (!lobbyChannel) return;

    // 获取当前大厅所有活跃连接
    lobbyChannel.presence.get((err, members) => {
        if (err) return console.error("Presence Error:", err);

        // 核心逻辑：归并算法。从成员的 metadata 中提取不重复的房间信息
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

// --- 3. 真正的房间创建逻辑 ---
async function createRoom() {
    const name = prompt("请输入房间名称:");
    if (!name) return;

    const roomId = 'room-' + Date.now();
    
    // 更新自己的状态，告知全网：我创建并进入了这个新房间
    // 这样其他用户的 lobbyChannel.presence.subscribe 就会被触发
    await lobbyChannel.presence.update({
        currentRoom: roomId,
        roomTitle: name
    });

    showToast(`房间 ${name} 已创建`);
    // 此时 fetchAndRenderRooms 会被自动触发
}

// --- 4. 视图更新 (MD3 规范) ---
function updateRoomUI(rooms) {
    const container = document.getElementById('message-container');
    const showingText = document.querySelector('.header-content p');
    
    container.innerHTML = '';
    if (showingText) showingText.textContent = `Showing: ${rooms.length} of ${rooms.length}`;

    if (rooms.length === 0) {
        container.innerHTML = `<div class="empty-state">目前没有活跃房间</div>`;
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

async function joinRoom(id, name) {
    // 正规切换逻辑：更新在 lobby 中的位置声明
    await lobbyChannel.presence.update({
        currentRoom: id,
        roomTitle: name
    });
    showToast(`已进入: ${name}`);
}

// 绑定 FAB 按钮
document.querySelector('.fab-btn').onclick = createRoom;
// 绑定刷新按钮
const refreshBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Refresh'));
if (refreshBtn) refreshBtn.onclick = fetchAndRenderRooms;

initApp();