const myId = 'Findor-' + Math.random().toString(36).substring(7);
let channel = null;

// --- 0. 彻底清除 3D 坦克时代的残留监听器 ---
// 强制覆盖掉 window 上的 keydown 事件，防止数字键被拦截
window.onkeydown = null;
window.onkeyup = null;

async function initChat() {
    try {
        const response = await fetch('/api/auth');
        const apiKey = await response.text();
        const ably = new Ably.Realtime({ key: apiKey.trim(), clientId: myId });

        await new Promise(resolve => ably.connection.on('connected', resolve));
        
        channel = ably.channels.get('global-chat');

        // 订阅消息
        channel.subscribe('msg', (messageData) => {
            renderMessage(messageData.clientId, messageData.data, messageData.clientId === myId);
        });

        // 统计在线人数
        channel.presence.subscribe('enter', updateCount);
        channel.presence.subscribe('leave', updateCount);
        
        // 进入 Presence 集合
        await channel.presence.enter();
        updateCount();

    } catch (err) {
        console.error("连接失败", err);
    }
}

function updateCount() {
    if (!channel) return;
    channel.presence.get((err, members) => {
        const countElement = document.getElementById('online-count');
        if (!err && countElement) {
            countElement.textContent = members.length;
        }
    });
}

function renderMessage(sender, text, isMe) {
    const container = document.getElementById('message-container');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = isMe ? 'flex-end' : 'flex-start';

    const bubble = document.createElement('div');
    bubble.className = isMe ? 'msg-bubble is-me' : 'msg-bubble';
    
    // 渲染发送者名称和内容
    bubble.innerHTML = `
        ${!isMe ? `<div class="sender-name">${sender}</div>` : ''}
        <div class="content"></div>
    `;
    
    // 使用 textContent 赋值，防止 XSS 攻击
    bubble.querySelector('.content').textContent = text;

    wrap.appendChild(bubble);
    container.appendChild(wrap);
    
    // 平滑滚动到底部
    container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
    });
}

function processSendMessage() {
    const input = document.getElementById('chat-input');
    const messageText = input.value.trim();
    
    if (messageText && channel) {
        channel.publish('msg', messageText);
        input.value = '';
        input.focus(); // 发送后重新聚焦
    }
}

// --- 事件绑定 ---
const sendButton = document.getElementById('send-btn');
const chatInput = document.getElementById('chat-input');

if (sendButton) {
    sendButton.onclick = processSendMessage;
}

if (chatInput) {
    // 确保数字输入不会被阻止
    chatInput.onkeydown = (e) => {
        // 允许所有字符（包括数字）传播，不调用 preventDefault
        e.stopPropagation();
    };

    chatInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
            processSendMessage();
        }
    };
}
// --- 功能扩展逻辑 ---

// 1. 侧边栏图标切换 (Active 状态切换)
const navIcons = document.querySelectorAll('.nav-icons .material-symbols-rounded');
navIcons.forEach(icon => {
    icon.onclick = () => {
        navIcons.forEach(i => i.classList.remove('active'));
        icon.classList.add('active');
        // 模拟切换视图逻辑
        const viewName = icon.textContent;
        console.log(`正在切换至视图: ${viewName}`);
        if (viewName === 'group') {
            showToast("正在加载成员列表...");
        }
    };
});

// 2. 左上角 FAB (新消息/新频道)
const fabBtn = document.querySelector('.fab-btn');
if (fabBtn) {
    fabBtn.onclick = () => {
        const channelName = prompt("请输入要创建/加入的频道名称:", "技术交流区");
        if (channelName) {
            showToast(`已请求加入频道: ${channelName}`);
        }
    };
}

// 3. 顶部更多菜单 (清除聊天记录/退出)
const moreBtn = document.querySelector('.top-app-bar .material-symbols-rounded:last-child');
if (moreBtn) {
    moreBtn.onclick = () => {
        const action = confirm("是否清空当前页面的聊天记录？（仅本地）");
        if (action) {
            const container = document.getElementById('message-container');
            container.innerHTML = '';
            showToast("聊天记录已清空");
        }
    };
}

// 4. 输入框左侧添加按钮 (附件/图片)
const addBtn = document.querySelector('.icon-prefix');
if (addBtn) {
    addBtn.onclick = () => {
        // 触发一个隐藏的文件选择器
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                showToast(`准备上传文件: ${file.name}`);
                // 此处可以扩展 Ably 的文件同步逻辑
            }
        };
        fileInput.click();
    };
}

// --- MD3 风格的轻量提示 (Toast) ---
function showToast(message) {
    let toast = document.getElementById('md3-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'md3-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

// 自动聚焦输入框
window.onload = () => {
    if (chatInput) chatInput.focus();
};

initChat();