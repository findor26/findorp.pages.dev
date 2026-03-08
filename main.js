/**
 * 高性能 3D坦克 监控类
 */
class OptimizedWatcher {
    constructor() {
        this.dom = {
            online: document.getElementById('v_online'),
            battle: document.getElementById('v_battle'),
            p4399: document.getElementById('v_4399')
        };
        this.state = { online: 0, battle: 0, p4399: 0 };
        this.config = {
            interval: 3000, 
            errorInterval: 10000,
            timeout: 2500 
        };
        this.isRunning = true;
        this.start();
    }

    wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async start() {
        while (this.isRunning) {
            const startTime = performance.now();
            let isSuccess = false;
            try {
                const data = await this.fetchData();
                if (data) {
                    this.process(data);
                    isSuccess = true;
                }
            } catch (e) {
                console.warn("Monitor Polling Skipped:", e.message);
            }
            const duration = performance.now() - startTime;
            const targetWait = isSuccess ? this.config.interval : this.config.errorInterval;
            await this.wait(Math.max(0, targetWait - duration));
        }
    }

    async fetchData() {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
        /* 使用 Cloudflare Worker 代理以绕过官方接口的 CORS 限制并解决 HTTPS 协议冲突 */
        const proxyUrl = `https://tanki-proxy.findor.workers.dev/?t=${Date.now()}`;
        
        const response = await fetch(proxyUrl, {
            signal: controller.signal,
            cache: 'no-store'
        });

        /* 处理 502 Bad Gateway 或其他官方维护导致的服务器错误 */
        if (!response.ok) {
            console.warn(`官方接口可能正在维护: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (err) {
        /* 避免超时中断抛出异常导致控制台报错堆叠 */
        if (err.name === 'AbortError') return null;
        
        /* 捕获网络断开或其他不可预知的抓取失败 */
        console.error("数据抓取异常:", err);
        return null;
    } finally {
        clearTimeout(id);
    }
}

    process(data) {
        if (!data || !data.nodes) return;
        let n_online = 0, n_battle = 0, n_4399 = 0;
        for (const key in data.nodes) {
            const node = data.nodes[key];
            n_online += (node.online || 0);
            n_battle += (node.inbattles || 0);
            if (node.partners?.my_4399_com) {
                n_4399 += node.partners.my_4399_com;
            }
        }
        this.renderIfChanged(n_online, n_battle, n_4399);
    }

    renderIfChanged(online, battle, p4399) {
        if (online !== this.state.online) {
            this.dom.online.textContent = online;
            this.triggerAnimation(this.dom.online);
            this.state.online = online;
        }
        if (battle !== this.state.battle) {
            this.dom.battle.textContent = battle;
            this.state.battle = battle;
        }
        if (p4399 !== this.state.p4399) {
            this.dom.p4399.textContent = p4399;
            this.state.p4399 = p4399;
        }
    }

    triggerAnimation(element) {
        element.animate([
            { transform: 'scale(1.05)', color: '#fff', textShadow: '0 0 10px #34c759' },
            { transform: 'scale(1)', color: '#3fb950', textShadow: 'none' }
        ], { duration: 200, easing: 'ease-out' });
    }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('v_online')) {
        new OptimizedWatcher();
    }
});

const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.querySelector('.sun-icon');
const moonIcon = document.querySelector('.moon-icon');
const body = document.body;

// 检查本地存储
const currentTheme = localStorage.getItem('theme') || 'light';
applyTheme(currentTheme);

themeToggle.addEventListener('click', () => {
    const newTheme = body.classList.contains('mdui-theme-light') ? 'dark' : 'light';
    applyTheme(newTheme);
});

function applyTheme(theme) {
    if (theme === 'dark') {
        body.classList.replace('mdui-theme-light', 'mdui-theme-dark');
        // 如果初始没有类名，则添加
        if (!body.classList.contains('mdui-theme-dark')) body.classList.add('mdui-theme-dark');
        
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.replace('mdui-theme-dark', 'mdui-theme-light');
        if (!body.classList.contains('mdui-theme-light')) body.classList.add('mdui-theme-light');

        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
        localStorage.setItem('theme', 'light');
    }
}