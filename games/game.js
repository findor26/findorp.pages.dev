// game.js - 完整逻辑扩展版
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

// 基础状态
let myPos = { x: 200, y: 200, angle: 0, hp: 100, shield: false, ghost: false, power: false };
let lastSentPos = { x: 0, y: 0, angle: 0 };
let lastSendTime = 0;
const syncInterval = 50; // 提高到 20Hz 同步，配合插值更丝滑

// 动态属性
let mySpeed = 4;
let bulletSpeed = 12;
let currentWeather = 'sunny'; // sunny, fog, ice, emp, rage
let weatherEndTime = 0;

const players = {}; 
const bullets = [];
const items = {};
const keys = {};
let joystickVector = { x: 0, y: 0 };
let joystickActive = false;

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

        // 核心同步订阅
        channel.subscribe('m', (m) => { 
            if (m.clientId !== myId) {
                if (!players[m.clientId]) {
                    players[m.clientId] = m.data;
                } else {
                    // 记录目标位置用于插值平滑
                    const p = players[m.clientId];
                    p.targetX = m.data.x;
                    p.targetY = m.data.y;
                    p.targetAngle = m.data.angle;
                    p.hp = m.data.hp;
                    p.shield = m.data.shield;
                    p.ghost = m.data.ghost;
                    p.power = m.data.power;
                    p.lastUpdate = Date.now();
                }
            }
        });

        channel.subscribe('f', (m) => { if (m.clientId !== myId) spawnBullet(m.data, false); });
        channel.subscribe('h', (m) => { if (m.data.targetId === myId) takeDamage(); });
        channel.subscribe('i', (m) => { items[m.data.id] = m.data; });
        channel.subscribe('d', (m) => { delete items[m.data.id]; });

        // 全局事件订阅
        channel.subscribe('sys_env', (m) => {
            currentWeather = m.data.type;
            weatherEndTime = m.data.endTime;
            applyWeatherEffect(m.data.type);
            console.log(`系统通知: ${m.data.msg}`);
        });

        channel.presence.subscribe('enter', checkHost);
        channel.presence.subscribe('leave', (m) => { delete players[m.clientId]; checkHost(); });

        await channel.presence.enter();
        checkHost();

        requestAnimationFrame(gameLoop);
        
        // 房主专属维护循环
        setInterval(() => { 
            if (isHost) {
                broadcastItem(); 
                if (Math.random() > 0.7) broadcastWeather(); // 30% 概率触发天气
                cleanupPlayers();
            }
        }, 8000);

    } catch (err) { 
        statusEl.textContent = "❌ 连接异常"; 
    }
}

// --- 房主逻辑扩展 ---

function checkHost() {
    channel.presence.get((err, members) => {
        if (!err && members.length > 0) {
            const sorted = members.sort((a, b) => a.timestamp - b.timestamp);
            isHost = (sorted[0].clientId === myId);
            countEl.textContent = members.length;
            if (isHost) statusEl.style.borderBottom = "2px solid #ffeb3b";
        }
    });
}

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

function broadcastWeather() {
    const events = [
        { type: 'fog', msg: '🌫️ 浓雾：视野大幅缩减', duration: 10000 },
        { type: 'ice', msg: '❄️ 极寒：坦克移动迟缓', duration: 7000 },
        { type: 'emp', msg: '⚡ EMP：UI与炮火失效', duration: 5000 },
        { type: 'rage', msg: '🔥 狂暴：全员射速翻倍', duration: 8000 }
    ];
    const evt = events[Math.floor(Math.random() * events.length)];
    channel.publish('sys_env', { 
        type: evt.type, 
        msg: evt.msg, 
        endTime: Date.now() + evt.duration 
    });
    
    // 自动恢复
    setTimeout(() => {
        channel.publish('sys_env', { type: 'sunny', msg: '天气转晴', endTime: 0 });
    }, evt.duration);
}

function cleanupPlayers() {
    const now = Date.now();
    for (let id in players) {
        if (now - (players[id].lastUpdate || 0) > 20000) {
            delete players[id];
        }
    }
}

// --- 游戏核心逻辑 ---

function applyWeatherEffect(type) {
    // 基础重置
    mySpeed = 4;
    statusEl.textContent = "✅ 已联机";
    
    if (type === 'ice') mySpeed = 1.5;
    if (type === 'emp') statusEl.textContent = "⚠️ 系统故障...";
}

function takeDamage() {
    if (myPos.shield) return;
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
    const moved = Math.hypot(myPos.x - lastSentPos.x, myPos.y - lastSentPos.y) > 1;
    const rotated = myPos.angle !== lastSentPos.angle;

    if (force || ((moved || rotated) && (now - lastSendTime > syncInterval))) {
        channel.publish('m', myPos);
        lastSentPos = { ...myPos };
        lastSendTime = now;
    }
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

function update() {
    // EMP 事件下无法开火和移动
    const canAction = currentWeather !== 'emp';

    if (canAction) {
        let vx = 0, vy = 0;
        let moved = false;

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

            for (let id in items) {
                const it = items[id];
                const rx = it.ratioX * canvas.width, ry = it.ratioY * canvas.height;
                if (Math.hypot(myPos.x + 20 - rx, myPos.y + 20 - ry) < 30) {
                    applyItemEffect(it.type);
                    channel.publish('d', { id: id });
                    delete items[id];
                }
            }
        }
    }
    
    // 其他玩家坐标插值平滑
    for (let id in players) {
        const p = players[id];
        if (p.targetX !== undefined) {
            p.x += (p.targetX - p.x) * 0.2; // 线性插值，0.2 为平滑度
            p.y += (p.targetY - p.y) * 0.2;
            p.angle = p.targetAngle; // 角度暂时直接跳变，防止旋转过慢
        }
    }

    syncPlayerData();

    // 子弹逻辑
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const rad = (b.angle - 90) * Math.PI / 180;
        const bSpd = (currentWeather === 'rage') ? b.speed * 2 : b.speed;
        b.x += Math.cos(rad) * bSpd;
        b.y += Math.sin(rad) * bSpd;
        b.dist += bSpd;

        if (b.isMine) {
            for (let pid in players) {
                const p = players[pid];
                if (!p.ghost && Math.hypot(b.x - (p.x + 20), b.y - (p.y + 20)) < 25) {
                    channel.publish('h', { targetId: pid });
                    b.active = false;
                }
            }
        }
        if (b.dist > 800 || !b.active) bullets.splice(i, 1);
    }
}

function applyItemEffect(type) {
    if (type === 'heal') myPos.hp = Math.min(100, myPos.hp + 30);
    else if (type === 'speed') { mySpeed = 8; setTimeout(() => mySpeed = 4, 5000); }
    else if (type === 'shield') { myPos.shield = true; setTimeout(() => { myPos.shield = false; syncPlayerData(true); }, 8000); }
    else if (type === 'power') { myPos.power = true; bulletSpeed = 24; setTimeout(() => { myPos.power = false; bulletSpeed = 12; syncPlayerData(true); }, 5000); }
    else if (type === 'ghost') { myPos.ghost = true; setTimeout(() => { myPos.ghost = false; syncPlayerData(true); }, 5000); }
    syncPlayerData(true);
}

// --- 绘图引擎 ---

function drawTank(ctx, x, y, angle, label, hp, color, states = {}) {
    ctx.save();
    ctx.translate(x + 20, y + 20);

    // UI 层
    ctx.save();
    ctx.fillStyle = "#444";
    ctx.fillRect(-20, -35, 40, 5);
    ctx.fillStyle = hp > 30 ? "#4caf50" : "#f44336";
    ctx.fillRect(-20, -35, 40 * (hp / 100), 5);
    ctx.fillStyle = "white";
    ctx.font = "12px Arial"; ctx.textAlign = "center";
    ctx.fillText(label, 0, -42);
    ctx.restore();

    if (states.shield) {
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 235, 59, 0.6)"; ctx.lineWidth = 3; ctx.stroke();
    }

    ctx.globalAlpha = states.ghost ? 0.3 : 1.0;
    ctx.rotate(angle * Math.PI / 180);
    ctx.fillStyle = color;
    ctx.fillRect(-20, -20, 40, 40);
    ctx.fillStyle = states.power ? "#f44336" : "#ccc";
    ctx.fillRect(-2, -30, 4, 15);
    ctx.restore();
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 道具
    for (let id in items) {
        const it = items[id];
        const rx = it.ratioX * canvas.width, ry = it.ratioY * canvas.height;
        ctx.beginPath(); ctx.arc(rx, ry, 15, 0, Math.PI * 2);
        const colors = { heal: '#4caf50', speed: '#2196f3', shield: '#ffeb3b', power: '#f44336', ghost: '#9c27b0' };
        ctx.fillStyle = colors[it.type]; ctx.fill();
        ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.textAlign = "center";
        ctx.fillText(it.type[0].toUpperCase(), rx, ry + 5);
    }

    // 2. 子弹
    for (const b of bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = b.speed > 15 ? "#ff5722" : "#ffff00"; ctx.fill();
    }

    // 3. 坦克
    drawTank(ctx, myPos.x, myPos.y, myPos.angle, "我", myPos.hp, "#0061a4", myPos);
    for (let id in players) {
        const p = players[id];
        drawTank(ctx, p.x, p.y, p.angle, id.substring(5, 9), p.hp || 100, "#ba1a1a", p);
    }

    // 4. 环境效果层
    if (currentWeather === 'fog') {
        const grad = ctx.createRadialGradient(myPos.x+20, myPos.y+20, 50, myPos.x+20, myPos.y+20, 300);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,canvas.width,canvas.height);
    } else if (currentWeather === 'ice') {
        ctx.fillStyle = 'rgba(173, 216, 230, 0.2)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
    }
}

// 交互
window.onkeydown = (e) => keys[e.key.toLowerCase()] = true;
window.onkeyup = (e) => { if (e.key === ' ' && currentWeather !== 'emp') fire(); keys[e.key.toLowerCase()] = false; };

function fire() {
    const data = { x: myPos.x + 20, y: myPos.y + 20, angle: myPos.angle, speed: bulletSpeed };
    spawnBullet(data, true);
    channel.publish('f', data);
}

fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if(currentWeather !== 'emp') fire(); });

// 摇杆控制保持原样...
const joy = document.getElementById('joystick-container');
joy.addEventListener('pointerdown', () => joystickActive = true);
window.addEventListener('pointermove', (e) => {
    if (!joystickActive) return;
    const r = joy.getBoundingClientRect();
    const cx = r.left + 60, cy = r.top + 60;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 50);
    const ang = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(ang)*dist}px, ${Math.sin(ang)*dist}px)`;
    joystickVector = { x: (Math.cos(ang)*dist)/50, y: (Math.sin(ang)*dist)/50 };
});
window.addEventListener('pointerup', () => { joystickActive = false; knob.style.transform = 'translate(0,0)'; joystickVector = {x:0,y:0}; });

init();