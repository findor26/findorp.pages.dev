// --- 全局变量定义 ---
let scene, camera, renderer, clock;
let myTankGroup, myTurret, myHull;
let channel = null; // 初始为 null，用于防止报错
let isHost = false;

const myId = 'Tank-' + Math.random().toString(36).substring(7);
const players = {}; 
const bullets = [];
const items = {};
const keys = {};

// 核心逻辑状态
let myPos = { 
    x: 0, z: 0, 
    angle: 0, 
    turretAngle: 0, 
    hp: 100, 
    shield: false, 
    power: false, 
    speedUp: false 
};

let lastSentPos = { x: 0, z: 0, angle: 0, turretAngle: 0 };
let lastSendTime = 0;
const syncInterval = 50; 
let baseSpeed = 10;
let bulletSpeed = 40;
let lastMouseX = 0, lastMouseY = 0;

// --- 1. 初始化 3D 场景 ---
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 45, 35);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 灯光设置
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(20, 50, 20);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // 地面网格
    const grid = new THREE.GridHelper(200, 40, 0x444444, 0x222222);
    scene.add(grid);
    const floorGeo = new THREE.PlaneGeometry(1000, 1000);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    clock = new THREE.Clock();
    
    // 创建本地坦克
    myTankGroup = createTankModel("#0061a4");
    myHull = myTankGroup.getObjectByName("hull");
    myTurret = myTankGroup.getObjectByName("turret");
    scene.add(myTankGroup);
}

// --- 2. 坦克模型构建函数 ---
function createTankModel(color) {
    const group = new THREE.Group();

    // 底盘
    const hullGeo = new THREE.BoxGeometry(4, 1.2, 5.5);
    const hullMat = new THREE.MeshPhongMaterial({ color: color });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.name = "hull";
    hull.castShadow = true;
    group.add(hull);

    // 履带
    const trackGeo = new THREE.BoxGeometry(1.2, 1.4, 5.8);
    const trackMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const leftTrack = new THREE.Mesh(trackGeo, trackMat);
    leftTrack.position.set(-2.2, 0, 0);
    hull.add(leftTrack);
    const rightTrack = new THREE.Mesh(trackGeo, trackMat);
    rightTrack.position.set(2.2, 0, 0);
    hull.add(rightTrack);

    // 独立炮塔
    const turretGroup = new THREE.Group();
    turretGroup.name = "turret";
    turretGroup.position.y = 1.1; 
    
    const turretBaseGeo = new THREE.BoxGeometry(2.8, 0.9, 2.8);
    const turretBase = new THREE.Mesh(turretBaseGeo, hullMat);
    turretBase.castShadow = true;
    turretGroup.add(turretBase);

    // 炮管
    const barrelGeo = new THREE.CylinderGeometry(0.35, 0.35, 4.5);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 2.8;
    barrel.name = "barrel";
    turretGroup.add(barrel);

    group.add(turretGroup);
    return group;
}

// --- 3. 异步联机初始化 ---
async function initNetwork() {
    try {
        const response = await fetch('/api/auth');
        const apiKey = await response.text();
        const ably = new Ably.Realtime({ key: apiKey.trim(), clientId: myId });
        
        await new Promise((resolve) => ably.connection.on('connected', resolve));
        
        channel = ably.channels.get('game-room');
        document.getElementById('my-id').textContent = myId;

        // 订阅位置
        channel.subscribe('m', (m) => {
            if (m.clientId !== myId) {
                if (!players[m.clientId]) {
                    const remoteTank = createTankModel("#ba1a1a");
                    scene.add(remoteTank);
                    players[m.clientId] = {
                        mesh: remoteTank,
                        targetX: m.data.x, targetZ: m.data.z,
                        targetAngle: m.data.angle, targetTurret: m.data.turretAngle,
                        hp: m.data.hp, power: m.data.power, shield: m.data.shield,
                        lastUpdate: Date.now()
                    };
                } else {
                    const p = players[m.clientId];
                    p.targetX = m.data.x; p.targetZ = m.data.z;
                    p.targetAngle = m.data.angle; p.targetTurret = m.data.turretAngle;
                    p.hp = m.data.hp; p.power = m.data.power; p.shield = m.data.shield;
                    p.lastUpdate = Date.now();
                }
            }
        });

        channel.subscribe('f', (m) => { if (m.clientId !== myId) spawnBullet(m.data, false); });
        channel.subscribe('h', (m) => { if (m.data.targetId === myId) takeDamage(); });

        await channel.presence.enter();
        checkHost();
        channel.presence.subscribe('enter', checkHost);
        channel.presence.subscribe('leave', (m) => {
            if (players[m.clientId]) {
                scene.remove(players[m.clientId].mesh);
                delete players[m.clientId];
            }
            checkHost();
        });

    } catch (err) {
        console.error("网络初始化失败:", err);
    }
}

function checkHost() {
    channel.presence.get((err, members) => {
        if (!err && members.length > 0) {
            const sorted = members.sort((a, b) => a.timestamp - b.timestamp);
            isHost = (sorted[0].clientId === myId);
            document.getElementById('count').textContent = members.length;
        }
    });
}

// --- 4. 核心物理与逻辑更新 ---
function gameLoop() {
    requestAnimationFrame(gameLoop);
    const delta = clock.getDelta();

    updateMyMovement(delta);
    updateRemotePlayers(delta);
    updateBullets(delta);

    // 相机插值平滑跟随
    const targetCamPos = new THREE.Vector3(myPos.x, 45, myPos.z + 35);
    camera.position.lerp(targetCamPos, 0.1);
    camera.lookAt(myPos.x, 0, myPos.z);

    renderer.render(scene, camera);
}

function updateMyMovement(delta) {
    const moveSpeed = myPos.speedUp ? baseSpeed * 1.8 : baseSpeed;
    const rotateSpeed = 2.8;

    // 底盘位移 (WASD)
    if (keys['w']) {
        myPos.x += Math.sin(myTankGroup.rotation.y) * moveSpeed * delta;
        myPos.z += Math.cos(myTankGroup.rotation.y) * moveSpeed * delta;
    }
    if (keys['s']) {
        myPos.x -= Math.sin(myTankGroup.rotation.y) * moveSpeed * delta;
        myPos.z -= Math.cos(myTankGroup.rotation.y) * moveSpeed * delta;
    }
    if (keys['a']) myTankGroup.rotation.y += rotateSpeed * delta;
    if (keys['d']) myTankGroup.rotation.y -= rotateSpeed * delta;

    myPos.angle = myTankGroup.rotation.y;
    myTankGroup.position.set(myPos.x, 0.6, myPos.z);

    // 炮塔指向鼠标 (Raycaster)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
        (lastMouseX / window.innerWidth) * 2 - 1,
        -(lastMouseY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    if (intersects.length > 0) {
        const target = intersects[0].point;
        const dx = target.x - myPos.x;
        const dz = target.z - myPos.z;
        // 计算相对于底盘的局部旋转
        myPos.turretAngle = Math.atan2(dx, dz) - myPos.angle;
        myTurret.rotation.y = myPos.turretAngle;
    }

    syncPlayerData();
}

function updateRemotePlayers(delta) {
    for (let id in players) {
        const p = players[id];
        if (p.targetX !== undefined) {
            // 位置和旋转插值
            p.mesh.position.x += (p.targetX - p.mesh.position.x) * 0.2;
            p.mesh.position.z += (p.targetZ - p.mesh.position.z) * 0.2;
            p.mesh.rotation.y += (p.targetAngle - p.mesh.rotation.y) * 0.2;
            
            const turret = p.mesh.getObjectByName("turret");
            turret.rotation.y += (p.targetTurret - turret.rotation.y) * 0.2;
            
            // 状态表现
            const barrel = p.mesh.getObjectByName("barrel");
            barrel.material.color.set(p.power ? 0xff4400 : 0x666666);
        }
    }
}

function syncPlayerData(force = false) {
    if (!channel) return; // 解决 Uncaught TypeError: Cannot read properties of undefined
    const now = Date.now();
    const moved = Math.hypot(myPos.x - lastSentPos.x, myPos.z - lastSentPos.z) > 0.1;
    if (force || (moved && (now - lastSendTime > syncInterval))) {
        channel.publish('m', myPos);
        lastSentPos = { ...myPos };
        lastSendTime = now;
    }
}

// --- 5. 战斗系统 ---
function spawnBullet(data, isMine) {
    const geo = new THREE.SphereGeometry(0.4);
    const mat = new THREE.MeshBasicMaterial({ color: data.power ? 0xff0000 : 0xffff00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, 1.8, data.z);
    scene.add(mesh);

    bullets.push({
        mesh: mesh,
        angle: data.totalAngle,
        speed: 50,
        dist: 0,
        isMine: isMine,
        active: true
    });
}

function fire() {
    if (!channel) return;
    const data = { 
        x: myPos.x, z: myPos.z, 
        totalAngle: myPos.angle + myPos.turretAngle,
        power: myPos.power 
    };
    spawnBullet(data, true);
    channel.publish('f', data);
}

function updateBullets(delta) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.x += Math.sin(b.angle) * b.speed * delta;
        b.mesh.position.z += Math.cos(b.angle) * b.speed * delta;
        b.dist += b.speed * delta;

        if (b.isMine) {
            for (let pid in players) {
                const p = players[pid];
                if (Math.hypot(b.mesh.position.x - p.mesh.position.x, b.mesh.position.z - p.mesh.position.z) < 3) {
                    channel.publish('h', { targetId: pid });
                    b.active = false;
                }
            }
        }
        if (b.dist > 150 || !b.active) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
        }
    }
}

function takeDamage() {
    if (myPos.shield) return;
    myPos.hp -= 20;
    if (myPos.hp <= 0) {
        myPos.hp = 100;
        myPos.x = (Math.random() - 0.5) * 40;
        myPos.z = (Math.random() - 0.5) * 40;
    }
    syncPlayerData(true);
}

// --- 6. 事件监听 ---
window.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});
window.addEventListener('mousedown', (e) => { if (e.button === 0) fire(); });
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 启动
init3D();
initNetwork();
gameLoop();