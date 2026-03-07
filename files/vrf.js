window.pendingUrl = '';
window.cfToken = '';

/**
 * 验证码成功回调：激活提交按钮
 */
window.onTurnstileSuccess = function(token) {
    window.cfToken = token;
    const btn = document.getElementById('submit-btn');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    }
};

window.verifyPassword = function(url) {
    window.pendingUrl = url;
    const dialog = document.getElementById('pw-dialog');
    const wrapper = document.getElementById('cf-wrapper');
    
    if (dialog && wrapper) {
        // 1. 物理清空旧容器，阻断报错递归
        wrapper.innerHTML = '<div id="cf-turnstile-container"></div>';
        
        // 2. 显示弹窗（带动画）
        dialog.className = 'dialog-showing';
        dialog.style.display = 'flex';
        
        // 3. 延迟显式渲染
        setTimeout(() => {
            if (window.turnstile) {
                try {
                    turnstile.render('#cf-turnstile-container', {
                        sitekey: '0x4AAAAAACnoEaLGtiIzO2nF',
                        theme: 'auto',
                        callback: (token) => window.onTurnstileSuccess(token),
                        'error-callback': (code) => {
                             console.error('Turnstile 报错代码:', code);
                             // 如果报错 600010，建议直接去 CF 后台删了重建一个 Key
                        }
                    });
                } catch (e) {
                    console.error("渲染组件时发生致命错误:", e);
                }
            }
        }, 150);
    }
};

window.closeDialog = function() {
    const dialog = document.getElementById('pw-dialog');
    const content = dialog.querySelector('div');
    const btn = document.getElementById('submit-btn');

    if (dialog) {
        /* 播放退场动画 */
        dialog.className = 'dialog-hiding';
        content.className = 'dialog-content-hiding';

        setTimeout(() => {
            dialog.style.display = 'none';
            /* 状态彻底清理 */
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
            }
            window.pendingUrl = '';
            window.cfToken = '';
        }, 200); 
    }
};

window.confirmPassword = async function() {
    if (!window.cfToken) return;

    const inputField = document.getElementById('pw-input');
    const password = inputField ? inputField.value.trim() : '';

    try {
        /* 向 Cloudflare Functions 发起验证请求 */
        const response = await fetch('/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: password,
                token: window.cfToken,
                fileName: window.pendingUrl
            })
        });

        const data = await response.json();

        if (response.ok) {
            /* 后端返回了真实路径，执行下载 */
            const downloader = document.createElement('a');
            downloader.href = data.url;
            downloader.download = '';
            document.body.appendChild(downloader);
            downloader.click();
            document.body.removeChild(downloader);
            
            window.closeDialog();
        } else {
            alert(data.error || "验证失败");
            if (window.turnstile) turnstile.reset('#cf-turnstile-container');
            window.cfToken = '';
        }
    } catch (err) {
        alert("网络异常，请稍后再试");
    }
};