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

// 自动聚焦输入框
window.onload = () => {
    if (chatInput) chatInput.focus();
};

initChat();