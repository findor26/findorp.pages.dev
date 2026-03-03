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
            const response = await fetch(`https://balancer.3dtank.com/balancer?t=${Date.now()}`, {
                signal: controller.signal,
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            if (err.name === 'AbortError') return null;
            throw err;
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

/**
 * 暗黑模式切换核心逻辑
 */
const initTheme = () => {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    if (!themeToggle) return; // 避免页面未找到按钮报错

    // 初始化：优先读取本地存储，其次读取系统偏好
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        body.classList.add('dark-mode');
    }

    // 绑定点击事件
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        
        // 记录状态
        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });
};

// 确保 DOM 加载完后再运行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
} else {
    initTheme();
}