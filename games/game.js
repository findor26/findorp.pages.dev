// game.js - 完整逻辑版
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const myIdEl = document.getElementById('my-id');
const countEl = document.getElementById('count');
const knob = document.getElementById('joystick-knob');
const fireBtn = document.getElementById('fire-btn');

const myId = 'Tank-' + Math.random().toString(36).substring(7);
let channel;
let isHost = false;

// 状态变量
let myPos = { x: 200, y: 200, angle: 0, hp: 100, shield: false, ghost: false };
let lastSentPos = { x: 0, y: 0, angle: 0 };
let lastSendTime = 0;
const syncInterval = 100; // 10Hz 同步频率，防止限流

let mySpeed = 4;
let bulletSpeed = 12;

const players = {}; 
const bullets = [];
const items = {};
const keys = {};
let joystickVector = { x: 0, y: 0 };
let joystickActive = false;

// 初始化画布
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

async function init() {
    try {
        const response = await fetch('/api/auth');
        const apiKey = await response.text();
        
        const ably = new Ably.Realtime({ key: apiKey.trim(), clientId: myId });
        
        ably.connection.on('connected', () => {
            statusEl.textContent = "✅ 已联机";
            checkHost();
        });

        channel = ably.channels.get('game-room');
        myIdEl.textContent = myId;

        // 核心订阅逻辑
        channel.subscribe('m', (m) => { if (m.clientId !== myId) players[m.clientId] = m.data; });
        channel.subscribe('f', (m) => { if (m.clientId !== myId) spawnBullet(m.data, false); });
        channel.subscribe('h', (m) => { if (m.data.targetId === myId) takeDamage(); });
        channel.subscribe('i', (m) => { items[m.data.id] = m.data; });
        channel.subscribe('d', (m) => { delete items[m.data.id]; });

        channel.presence.subscribe('enter', checkHost);
        channel.presence.subscribe('leave', (m) => { delete players[m.clientId]; checkHost(); });

        await channel.presence.enter();
        checkHost();

        requestAnimationFrame(gameLoop);
        
        // 房主生成道具
        setInterval(() => { if (isHost) broadcastItem(); }, 6000); // 缩短到 6 秒，因为道具种类变多了

    } catch (err) { 
        statusEl.textContent = "❌ 连接异常"; 
    }
}

function checkHost() {
    channel.presence.get((err, members) => {
        if (!err && members.length > 0) {
            const sorted = members.sort((a, b) => a.timestamp - b.timestamp);
            isHost = (sorted[0].clientId === myId);
            countEl.textContent = members.length;
        }
    });
}

// 广播新道具（更多类型逻辑）
function broadcastItem() {
    const types = ['heal', 'speed', 'shield', 'power', 'ghost'];
    const itemData = {
        id: 'it-' + Math.random().toString(36).substring(7),
        ratioX: 0.1 + Math.random() * 0.8, 
        ratioY: 0.1 + Math.random() * 0.8,
        type: types[Math.floor(Math.random() * types.length)]
    };
    channel.publish('i', itemData);
}

function spawnBullet(data, isMine) {
    bullets.push({
        x: data.x, y: data.y, angle: data.angle,
        speed: data.speed || 12,
        dist: 0, isMine: isMine, active: true
    });
}

function takeDamage() {
    if (myPos.shield) return; // 护盾期间免疫伤害
    
    myPos.hp -= 15;
    if (myPos.hp <= 0) {
        myPos.hp = 100;
        myPos.x = Math.random() * (canvas.width - 40);
        myPos.y = Math.random() * (canvas.height - 40);
    }
    syncPlayerData(true);
}

function syncPlayerData(force = false) {
    const now = Date.now();
    const dist = Math.hypot(myPos.x - lastSentPos.x, myPos.y - lastSentPos.y);
    const angleChanged = myPos.angle !== lastSentPos.angle;

    if (force || ((dist > 2 || angleChanged) && (now - lastSendTime > syncInterval))) {
        channel.publish('m', myPos);
        lastSentPos = { ...myPos };
        lastSendTime = now;
    }
}

// 坦克渲染逻辑（包含特殊状态视觉效果）
function drawTank(ctx, x, y, angle, label, hp, color, states = {}) {
    ctx.save();
    ctx.translate(x + 20, y + 20);

    // 绘制血条 UI
    ctx.save();
    ctx.fillStyle = "#444";
    ctx.fillRect(-20, -35, 40, 5);
    ctx.fillStyle = hp > 30 ? "#4caf50" : "#f44336";
    ctx.fillRect(-20, -35, 40 * (hp / 100), 5);
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, -42);
    ctx.restore();

    // 绘制护盾特效
    if (states.shield) {
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 235, 59, 0.6)";
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // 幽灵化透明度处理
    ctx.globalAlpha = states.ghost ? 0.4 : 1.0;

    // 绘制坦克旋转部分
    ctx.rotate(angle * Math.PI / 180);
    ctx.fillStyle = color;
    ctx.fillRect(-20, -20, 40, 40);
    
    // 强化子弹时的炮管变色
    ctx.fillStyle = states.power ? "#f44336" : "#ccc";
    ctx.fillRect(-2, -30, 4, 15);
    
    ctx.restore();
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

function update() {
    let moved = false;
    let vx = 0, vy = 0;

    if (keys['w']) { vy = -mySpeed; myPos.angle = 0; moved = true; }
    else if (keys['s']) { vy = mySpeed; myPos.angle = 180; moved = true; }
    else if (keys['a']) { vx = -mySpeed; myPos.angle = 270; moved = true; }
    else if (keys['d']) { vx = mySpeed; myPos.angle = 90; moved = true; }
    else if (joystickVector.x !== 0 || joystickVector.y !== 0) {
        vx = joystickVector.x * mySpeed;
        vy = joystickVector.y * mySpeed;
        const deg = Math.atan2(joystickVector.y, joystickVector.x) * 180 / Math.PI + 90;
        myPos.angle = Math.round(deg / 90) * 90;
        moved = true;
    }

    if (moved) {
        myPos.x = Math.max(0, Math.min(canvas.width - 40, myPos.x + vx));
        myPos.y = Math.max(0, Math.min(canvas.height - 40, myPos.y + vy));

        // 道具碰撞与逻辑分发
        for (let id in items) {
            const it = items[id];
            const rx = it.ratioX * canvas.width;
            const ry = it.ratioY * canvas.height;
            if (Math.hypot(myPos.x + 20 - rx, myPos.y + 20 - ry) < 30) {
                applyEffect(it.type);
                channel.publish('d', { id: id });
                delete items[id];
            }
        }
    }
    
    syncPlayerData();

    // 更新子弹
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const rad = (b.angle - 90) * Math.PI / 180;
        b.x += Math.cos(rad) * b.speed;
        b.y += Math.sin(rad) * b.speed;
        b.dist += b.speed;

        if (b.isMine) {
            for (let pid in players) {
                const p = players[pid];
                // 幽灵状态无法被击中，但坦克中心点判定保持不变
                if (!p.ghost && Math.hypot(b.x - (p.x + 20), b.y - (p.y + 20)) < 25) {
                    channel.publish('h', { targetId: pid });
                    b.active = false;
                }
            }
        }
        if (b.dist > 800 || !b.active) bullets.splice(i, 1);
    }
}

// 道具效果处理函数
function applyEffect(type) {
    switch(type) {
        case 'heal':
            myPos.hp = Math.min(100, myPos.hp + 30);
            break;
        case 'speed':
            mySpeed = 8;
            setTimeout(() => { mySpeed = 4; }, 5000);
            break;
        case 'shield':
            myPos.shield = true;
            setTimeout(() => { myPos.shield = false; syncPlayerData(true); }, 8000);
            break;
        case 'power':
            bulletSpeed = 24;
            myPos.power = true;
            setTimeout(() => { bulletSpeed = 12; myPos.power = false; syncPlayerData(true); }, 5000);
            break;
        case 'ghost':
            myPos.ghost = true;
            setTimeout(() => { myPos.ghost = false; syncPlayerData(true); }, 5000);
            break;
    }
    syncPlayerData(true);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 道具渲染
    for (let id in items) {
        const it = items[id];
        const rx = it.ratioX * canvas.width, ry = it.ratioY * canvas.height;
        ctx.beginPath();
        ctx.arc(rx, ry, 15, 0, Math.PI * 2);
        
        // 颜色映射
        const colors = { heal: '#4caf50', speed: '#2196f3', shield: '#ffeb3b', power: '#f44336', ghost: '#9c27b0' };
        const icons = { heal: '+', speed: '⚡', shield: '🛡️', power: '🔥', ghost: '👻' };
        
        ctx.fillStyle = colors[it.type];
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(icons[it.type], rx, ry + 6);
    }

    // 子弹渲染
    for (const b of bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = b.speed > 15 ? "#ff5722" : "#ffff00";
        ctx.fill();
    }

    // 玩家渲染
    drawTank(ctx, myPos.x, myPos.y, myPos.angle, "我", myPos.hp, "#0061a4", {
        shield: myPos.shield,
        ghost: myPos.ghost,
        power: myPos.power
    });
    
    for (let id in players) {
        const p = players[id];
        drawTank(ctx, p.x, p.y, p.angle, id.substring(5, 9), p.hp || 100, "#ba1a1a", {
            shield: p.shield,
            ghost: p.ghost,
            power: p.power
        });
    }
}

// 交互绑定
window.onkeydown = (e) => keys[e.key.toLowerCase()] = true;
window.onkeyup = (e) => { if (e.key === ' ') fire(); keys[e.key.toLowerCase()] = false; };

function fire() {
    const data = { x: myPos.x + 20, y: myPos.y + 20, angle: myPos.angle, speed: bulletSpeed };
    spawnBullet(data, true);
    channel.publish('f', data);
}

fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); fire(); });

const joy = document.getElementById('joystick-container');
joy.addEventListener('pointerdown', () => joystickActive = true);
window.addEventListener('pointermove', (e) => {
    if (!joystickActive) return;
    const r = joy.getBoundingClientRect();
    const centerX = r.left + 60, centerY = r.top + 60;
    const dx = e.clientX - centerX, dy = e.clientY - centerY;
    const distance = Math.min(Math.sqrt(dx*dx + dy*dy), 50);
    const angle = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(angle)*distance}px, ${Math.sin(angle)*distance}px)`;
    joystickVector = { x: (Math.cos(angle)*distance) / 50, y: (Math.sin(angle)*distance) / 50 };
});
window.addEventListener('pointerup', () => {
    joystickActive = false;
    knob.style.transform = 'translate(0,0)';
    joystickVector = { x: 0, y: 0 };
});

init();