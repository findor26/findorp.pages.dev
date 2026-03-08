// --- 核心全局变量 ---
let scene, camera, renderer, clock;
let physicsWorld, tankBody, groundMaterial, wallMaterial;
let myTankGroup, myTurret;
let channel = null;
let isHost = false;

const myId = 'Tank-' + Math.random().toString(36).substring(7);
const players = {}; 
const bullets = [];
const obstacles = []; // 存储障碍物对象
const items = {};
const keys = {};

// 状态同步数据
let myPos = { 
    x: 0, y: 0.6, z: 0, 
    angle: 0, turretAngle: 0, 
    hp: 100, shield: false, power: false, speedUp: false 
};

let lastSentPos = { x: 0, z: 0, angle: 0, turretAngle: 0 };
let lastSendTime = 0;
const syncInterval = 50; 

// 摇杆与控制变量
let joystickVector = { x: 0, y: 0 };
let isJoystickActive = false;
let lastMouseX = 0, lastMouseY = 0;

// --- 1. 初始化物理引擎 ---
function initPhysics() {
    // 创建物理世界并设置重力
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, -9.82, 0);
    physicsWorld.broadphase = new CANNON.NaiveBroadphase();
    physicsWorld.solver.iterations = 10;

    // 材质定义用于摩擦力计算
    groundMaterial = new CANNON.Material("groundMaterial");
    wallMaterial = new CANNON.Material("wallMaterial");
    
    // 地面物理形态
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    physicsWorld.addBody(groundBody);

    // 创建坦克物理刚体
    const boxShape = new CANNON.Box(new CANNON.Vec3(2, 0.75, 2.75));
    tankBody = new CANNON.Body({ 
        mass: 1500, // 模拟坦克重型手感
        material: new CANNON.Material("tankMaterial"),
        linearDamping: 0.9, // 模拟履带摩擦力导致的减速
        angularDamping: 0.99
    });
    tankBody.addShape(boxShape);
    tankBody.position.set(0, 5, 0);
    physicsWorld.addBody(tankBody);
}

// --- 2. 障碍物生成系统 ---
function createObstacles() {
    const obstacleData = [
        { x: 15, z: 15, w: 5, h: 4, d: 5 },
        { x: -15, z: -20, w: 8, h: 6, d: 4 },
        { x: 20, z: -10, w: 4, h: 4, d: 10 },
        { x: 0, z: 25, w: 12, h: 3, d: 3 }
    ];

    obstacleData.forEach(data => {
        // 渲染引擎物体
        const geometry = new THREE.BoxGeometry(data.w, data.h, data.d);
        const material = new THREE.MeshPhongMaterial({ color: 0x555555 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(data.x, data.h / 2, data.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // 物理引擎刚体
        const shape = new CANNON.Box(new CANNON.Vec3(data.w / 2, data.h / 2, data.d / 2));
        const body = new CANNON.Body({ mass: 0 }); // 静态物体
        body.addShape(shape);
        body.position.set(data.x, data.h / 2, data.z);
        physicsWorld.addBody(body);
        
        obstacles.push({ mesh, body });
    });
}

// --- 3. 渲染引擎初始化 ---
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 50, 40);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(50, 100, 50);
    light.castShadow = true;
    scene.add(light);

    clock = new THREE.Clock();
    
    myTankGroup = createTankModel("#0061a4");
    myTurret = myTankGroup.getObjectByName("turret");
    scene.add(myTankGroup);

    createObstacles();
    initMobileControls();
}

// --- 4. 移动端与摇杆逻辑修复 ---
function initMobileControls() {
    const knob = document.getElementById('joystick-knob');
    const container = document.getElementById('joystick-container');
    const fireBtn = document.getElementById('fire-btn');

    const handleJoystick = (e) => {
        if (!isJoystickActive) return;
        const touch = e.touches ? e.touches[0] : e;
        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 50);
        const angle = Math.atan2(dy, dx);
        
        knob.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
        
        // 修复：将摇杆坐标正确映射到 3D 世界的 X/Z 轴
        joystickVector.x = (Math.cos(angle) * dist) / 50;
        joystickVector.y = (Math.sin(angle) * dist) / 50;
    };

    container.addEventListener('pointerdown', (e) => { isJoystickActive = true; handleJoystick(e); });
    window.addEventListener('pointermove', handleJoystick);
    window.addEventListener('pointerup', () => {
        isJoystickActive = false;
        knob.style.transform = 'translate(0,0)';
        joystickVector = { x: 0, y: 0 };
    });

    fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); fire(); });
}

// --- 5. 核心循环与物理同步 ---
function gameLoop() {
    requestAnimationFrame(gameLoop);
    const delta = Math.min(clock.getDelta(), 0.1);

    // 模拟物理世界步进，确保帧率无关的碰撞计算
    physicsWorld.step(1/60, delta, 3);

    updateMovement(delta);
    updateRemotePlayers(delta);
    updateBullets(delta);

    // 将物理引擎坐标映射到渲染引擎，实现视觉一致性
    myTankGroup.position.copy(tankBody.position);
    myTankGroup.quaternion.copy(tankBody.quaternion);
    
    myPos.x = tankBody.position.x;
    myPos.y = tankBody.position.y;
    myPos.z = tankBody.position.z;
    myPos.angle = myTankGroup.rotation.y;

    camera.position.lerp(new THREE.Vector3(myPos.x, 45, myPos.z + 35), 0.1);
    camera.lookAt(myPos.x, 0, myPos.z);

    renderer.render(scene, camera);
}

function updateMovement(delta) {
    const moveSpeed = myPos.speedUp ? 4000 : 2500;
    const rotateForce = 1500;

    // 键盘控制
    if (keys['w']) tankBody.applyLocalForce(new CANNON.Vec3(0, 0, moveSpeed), new CANNON.Vec3(0,0,0));
    if (keys['s']) tankBody.applyLocalForce(new CANNON.Vec3(0, 0, -moveSpeed), new CANNON.Vec3(0,0,0));
    if (keys['a']) tankBody.angularVelocity.y = 2.5;
    else if (keys['d']) tankBody.angularVelocity.y = -2.5;
    else if (!isJoystickActive) tankBody.angularVelocity.y *= 0.9;

    // 摇杆控制修复（支持 360 度平滑转向）
    if (isJoystickActive) {
        const force = new CANNON.Vec3(0, 0, -joystickVector.y * moveSpeed);
        tankBody.applyLocalForce(force, new CANNON.Vec3(0,0,0));
        tankBody.angularVelocity.y = -joystickVector.x * 3.5;
    }

    // 炮塔指向更新
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
        (lastMouseX / window.innerWidth) * 2 - 1,
        -(lastMouseY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    if (intersects.length > 0) {
        const target = intersects[0].point;
        myPos.turretAngle = Math.atan2(target.x - myPos.x, target.z - myPos.z) - myTankGroup.rotation.y;
        myTurret.rotation.y = myPos.turretAngle;
    }

    syncPlayerData();
}

// --- 6. 联机同步逻辑 ---
async function initNetwork() {
    try {
        const response = await fetch('/api/auth');
        const apiKey = await response.text();
        const ably = new Ably.Realtime({ key: apiKey.trim(), clientId: myId });
        await new Promise(resolve => ably.connection.on('connected', resolve));
        
        channel = ably.channels.get('game-room');
        
        channel.subscribe('m', (m) => {
            if (m.clientId !== myId) {
                if (!players[m.clientId]) {
                    players[m.clientId] = {
                        mesh: createTankModel("#ba1a1a"),
                        targetX: m.data.x, targetZ: m.data.z, targetAngle: m.data.angle,
                        targetTurret: m.data.turretAngle, hp: m.data.hp
                    };
                    scene.add(players[m.clientId].mesh);
                } else {
                    const p = players[m.clientId];
                    p.targetX = m.data.x; p.targetZ = m.data.z;
                    p.targetAngle = m.data.angle; p.targetTurret = m.data.turretAngle;
                    p.hp = m.data.hp;
                }
            }
        });

        channel.subscribe('f', (m) => { if (m.clientId !== myId) spawnBullet(m.data, false); });
    } catch (e) { console.error("网络初始化失败"); }
}

function updateRemotePlayers(delta) {
    for (let id in players) {
        const p = players[id];
        // 平滑插值处理，防止网络抖动造成的视觉卡顿
        p.mesh.position.x += (p.targetX - p.mesh.position.x) * 0.15;
        p.mesh.position.z += (p.targetZ - p.mesh.position.z) * 0.15;
        p.mesh.rotation.y += (p.targetAngle - p.mesh.rotation.y) * 0.15;
        const turret = p.mesh.getObjectByName("turret");
        turret.rotation.y += (p.targetTurret - turret.rotation.y) * 0.15;
    }
}

function syncPlayerData(force = false) {
    if (!channel) return;
    const now = Date.now();
    const moved = Math.hypot(myPos.x - lastSentPos.x, myPos.z - lastSentPos.z) > 0.15;
    if (force || (moved && (now - lastSendTime > syncInterval))) {
        channel.publish('m', myPos);
        lastSentPos = { ...myPos };
        lastSendTime = now;
    }
}

// --- 7. 战斗与模型 ---
function spawnBullet(data, isMine) {
    const geo = new THREE.SphereGeometry(0.4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, 1.8, data.z);
    scene.add(mesh);

    bullets.push({ mesh, angle: data.totalAngle, speed: 60, dist: 0, isMine, active: true });
}

function fire() {
    if (!channel) return;
    const data = { x: myPos.x, z: myPos.z, totalAngle: myTankGroup.rotation.y + myPos.turretAngle };
    spawnBullet(data, true);
    channel.publish('f', data);
}

function updateBullets(delta) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.x += Math.sin(b.angle) * b.speed * delta;
        b.mesh.position.z += Math.cos(b.angle) * b.speed * delta;
        b.dist += b.speed * delta;
        
        // 简易障碍物碰撞检测
        obstacles.forEach(obs => {
            if (Math.hypot(b.mesh.position.x - obs.mesh.position.x, b.mesh.position.z - obs.mesh.position.z) < 2) {
                b.active = false;
            }
        });

        if (b.dist > 200 || !b.active) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
        }
    }
}

function createTankModel(color) {
    const group = new THREE.Group();
    const hullGeo = new THREE.BoxGeometry(4, 1.2, 5.5);
    const hullMat = new THREE.MeshPhongMaterial({ color });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.name = "hull";
    group.add(hull);

    const turretGroup = new THREE.Group();
    turretGroup.name = "turret";
    turretGroup.position.y = 1.1;
    const turretBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 2.5), hullMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 2.5;
    turretGroup.add(turretBase);
    turretGroup.add(barrel);
    group.add(turretGroup);
    return group;
}

// 事件绑定
window.addEventListener('mousemove', (e) => { lastMouseX = e.clientX; lastMouseY = e.clientY; });
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

init3D();
initPhysics();
initNetwork();
gameLoop();