const myId = 'Findor-' + Math.random().toString(36).substring(7);
let channel = null;

async function initChat() {
    try {
        const response = await fetch('/api/auth');
        const apiKey = await response.text();
        const ably = new Ably.Realtime({ key: apiKey.trim(), clientId: myId });

        await new Promise(resolve => ably.connection.on('connected', resolve));
        
        channel = ably.channels.get('global-chat');

        // 订阅消息
        channel.subscribe('msg', (m) => {
            renderMessage(m.clientId, m.data, m.clientId === myId);
        });

        // 统计在线人数
        channel.presence.subscribe('enter', updateCount);
        channel.presence.subscribe('leave', updateCount);
        await channel.presence.enter();
        updateCount();

    } catch (err) {
        console.error("连接失败", err);
    }
}

function updateCount() {
    channel.presence.get((err, members) => {
        if (!err) document.getElementById('online-count').textContent = members.length;
    });
}

function renderMessage(sender, text, isMe) {
    const container = document.getElementById('message-container');
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';

    const bubble = document.createElement('div');
    bubble.className = isMe ? 'msg-bubble is-me' : 'msg-bubble';
    bubble.innerHTML = `
        ${!isMe ? `<div class="sender-name">${sender}</div>` : ''}
        <div class="content">${text}</div>
    `;

    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
}

function send() {
    const input = document.getElementById('chat-input');
    if (input.value.trim() && channel) {
        channel.publish('msg', input.value.trim());
        input.value = '';
    }
}

document.getElementById('send-btn').onclick = send;
document.getElementById('chat-input').onkeypress = (e) => e.key === 'Enter' && send();

initChat();