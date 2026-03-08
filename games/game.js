// game.js - Three.js 3D坦克版
let scene, camera, renderer, clock;
let myTankGroup, myTurret, myHull;
const players = {}; // 存储远程玩家的 3D 模型和数据
const bullets = [];
const items = {};
const keys = {};

const myId = 'Tank-' + Math.random().toString(36).substring(7);
let channel;
let isHost = false;

// 逻辑状态保持不变，方便同步
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

// --- 1. 3D 环境初始化 ---
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 50, 30); // 俯视视角
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(10, 50, 10);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // 地面
    const floorGeo = new THREE.PlaneGeometry(1000, 1000);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    clock = new THREE.Clock();
    
    // 创建我的坦克
    myTankGroup = createTankModel("#0061a4");
    myHull = myTankGroup.getObjectByName("hull");
    myTurret = myTankGroup.getObjectByName("turret");
    scene.add(myTankGroup);

    window.addEventListener('resize', onWindowResize);
}

// --- 2. 坦克模型构建 (3D坦克风格) ---
function createTankModel(color) {
    const group = new THREE.Group();

    // 底盘 (Hull)
    const hullGeo = new THREE.BoxGeometry(4, 1.5, 5);
    const hullMat = new THREE.MeshPhongMaterial({ color: color });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.name = "hull";
    hull.castShadow = true;
    group.add(hull);

    // 履带细节
    const trackGeo = new THREE.BoxGeometry(1, 1.6, 5.2);
    const trackMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const leftTrack = new THREE.Mesh(trackGeo, trackMat);
    leftTrack.position.set(-2.2, 0, 0);
    hull.add(leftTrack);
    const rightTrack = new THREE.Mesh(trackGeo, trackMat);
    rightTrack.position.set(2.2, 0, 0);
    hull.add(rightTrack);

    // 炮塔 (Turret) - 独立层级
    const turretGroup = new THREE.Group();
    turretGroup.name = "turret";
    turretGroup.position.y = 1; 
    
    const turretBaseGeo = new THREE.BoxGeometry(2.5, 1, 2.5);
    const turretBase = new THREE.Mesh(turretBaseGeo, hullMat);
    turretBase.castShadow = true;
    turretGroup.add(turretBase);

    // 炮管
    const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 4);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 2.5;
    barrel.name = "barrel";
    turretGroup.add(barrel);

    group.add(turretGroup);
    return group;
}

// --- 3. 核心游戏循环 (保持原有同步系统) ---
function gameLoop() {
    requestAnimationFrame(gameLoop);
    const delta = clock.getDelta();

    updateMyMovement(delta);
    updateRemotePlayers(delta);
    updateBullets(delta);
    
    // 相机跟随
    camera.position.lerp(new THREE.Vector3(myPos.x, 40, myPos.z + 30), 0.1);
    camera.lookAt(myPos.x, 0, myPos.z);

    renderer.render(scene, camera);
}

function updateMyMovement(delta) {
    const moveSpeed = myPos.speedUp ? 15 : 10;
    const rotateSpeed = 2.5;

    // 底盘移动 (WASD)
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
    myTankGroup.position.set(myPos.x, 0, myPos.z);

    // 炮塔指向鼠标位置
    updateTurretToMouse();

    // 发包同步
    syncPlayerData();
}

function updateTurretToMouse() {
    // 简单的射线检测获取鼠标在地面上的 3D 坐标
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
        (window.lastMouseX / window.innerWidth) * 2 - 1,
        -(window.lastMouseY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    
    if (intersects.length > 0) {
        const target = intersects[0].point;
        const dx = target.x - myPos.x;
        const dz = target.z - myPos.z;
        myPos.turretAngle = Math.atan2(dx, dz) - myPos.angle;
        myTurret.rotation.y = myPos.turretAngle;
    }
}

// --- 4. 远程同步与平滑插值 ---
function updateRemotePlayers(delta) {
    for (let id in players) {
        const p = players[id];
        if (p.targetX !== undefined) {
            // 平滑移动插值 (Lerp)
            p.mesh.position.x += (p.targetX - p.mesh.position.x) * 0.2;
            p.mesh.position.z += (p.targetZ - p.mesh.position.z) * 0.2;
            p.mesh.rotation.y += (p.targetAngle - p.mesh.rotation.y) * 0.2;
            
            const turret = p.mesh.getObjectByName("turret");
            turret.rotation.y += (p.targetTurret - turret.rotation.y) * 0.2;
            
            // 状态同步 (颜色变化代表威力/护盾)
            const barrel = p.mesh.getObjectByName("barrel");
            barrel.material.color.set(p.power ? 0xff0000 : 0x555555);
        }
    }
}

// --- 5. 联机部分 (逻辑复用) ---
async function initNetwork() {
    // 这里保留你之前的 Ably 初始化逻辑...
    // channel.subscribe('m', (m) => { ... 处理 p.targetX, p.targetZ 等 ... });
    // 当有新玩家加入时：
    // players[m.clientId].mesh = createTankModel("#ba1a1a");
    // scene.add(players[m.clientId].mesh);
}

function spawnBullet(data, isMine) {
    const geo = new THREE.SphereGeometry(0.3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, 1.5, data.z);
    scene.add(mesh);

    bullets.push({
        mesh: mesh,
        angle: data.totalAngle, // 底盘 + 炮塔角度
        speed: data.speed || 40,
        dist: 0,
        isMine: isMine,
        active: true
    });
}

function syncPlayerData(force = false) {
    const now = Date.now();
    if (force || (now - lastSendTime > syncInterval)) {
        channel.publish('m', myPos);
        lastSendTime = now;
    }
}

// 辅助
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('mousemove', (e) => {
    window.lastMouseX = e.clientX;
    window.lastMouseY = e.clientY;
});

window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

// 启动
init3D();
initNetwork();
gameLoop();