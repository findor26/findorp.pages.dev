const myId = 'Findor-' + Math.random().toString(36).substring(7);
let ably = null;
let lobbyChannel = null;
let allRooms = []; // 存储所有在线房间数据

// --- 1. 初始化连接 ---
async function initApp() {
    try {
        const response = await fetch('/api/auth');
        const apiKey = await response.text();
        
        // 初始化 Ably 客户端
        ably = new Ably.Realtime({ key: apiKey.trim(), clientId: myId });
        await new Promise(resolve => ably.connection.on('connected', resolve));
        
        // 默认进入大厅频道（用于发现房间）
        lobbyChannel = ably.channels.get('lobby');
        await lobbyChannel.presence.enter({ roomName: '大厅' });
        
        showToast("已连接至服务器");
        refreshRooms(); // 初始加载
    } catch (err) {
        console.error("认证失败:", err);
        showToast("无法获取 API Key");
    }
}

// --- 2. 刷新按钮功能 (Refresh) ---
async function refreshRooms() {
    if (!lobbyChannel) return;

    showToast("正在同步房间...");
    
    // 获取大厅中的所有成员，分析他们所在的房间
    lobbyChannel.presence.get((err, members) => {
        if (err) return console.error(err);

        // 模拟/分析成员数据生成房间列表
        // 实际开发中通常由后端 API 直接返回 active_channels
        allRooms = [
            { id: 'tech', name: '技术交流区', count: members.length, lastActive: '刚才' },
            { id: 'tank', name: '3D坦克基地', count: 3, lastActive: '5分钟前' },
            { id: 'chat', name: '闲聊区', count: 7, lastActive: '2小时前' }
        ];

        renderRoomUI(allRooms);
        updateRoomStatusText(allRooms.length);
    });
}

// --- 3. 房间搜索功能 (Room Finder) ---
const chatInput = document.getElementById('chat-input');
chatInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = allRooms.filter(room => 
        room.name.toLowerCase().includes(searchTerm) || 
        room.id.toLowerCase().includes(searchTerm)
    );
    renderRoomUI(filtered);
    updateRoomStatusText(filtered.length);
});

// --- 4. 侧边栏按钮逻辑 (Navigation Rail) ---
document.querySelectorAll('.nav-icons span').forEach(icon => {
    icon.onclick = () => {
        // MD3 状态切换
        document.querySelector('.nav-icons .active').classList.remove('active');
        icon.classList.add('active');
        
        const view = icon.textContent;
        if (view === 'group') {
            showToast("正在加载用户列表...");
        } else if (view === 'settings') {
            showToast("设置界面开发中...");
        }
    };
});

// --- 5. 创建按钮功能 (FAB) ---
document.querySelector('.fab-btn').onclick = () => {
    const newRoomName = prompt("请输入新房间名称:");
    if (newRoomName) {
        showToast(`房间 "${newRoomName}" 创建成功！`);
        // 逻辑：在此发布一条创建消息或直接跳转
    }
};

// --- 辅助：渲染列表 ---
function renderRoomUI(rooms) {
    const container = document.getElementById('message-container');
    container.innerHTML = '';

    if (rooms.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-rounded">search_off</span>
                <p>没有找到匹配的房间</p>
            </div>
        `;
        return;
    }

    rooms.forEach(room => {
        const card = document.createElement('div');
        card.className = 'room-card';
        card.onclick = () => joinRoom(room.id);
        card.innerHTML = `
            <div class="room-lead">
                <span class="material-symbols-rounded">forum</span>
            </div>
            <div class="room-content">
                <div class="room-title">${room.name}</div>
                <div class="room-meta">${room.count} 人在线 · ${room.lastActive}</div>
            </div>
            <span class="material-symbols-rounded">chevron_right</span>
        `;
        container.appendChild(card);
    });
}

function updateRoomStatusText(count) {
    const statusText = document.querySelector('.header-content p') || { textContent: '' };
    statusText.textContent = `Showing: ${count} of ${allRooms.length}`;
}

function joinRoom(id) {
    showToast(`进入房间: ${id}`);
}

initApp();