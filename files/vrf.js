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
    if (dialog) {
        dialog.style.display = 'flex';
        
        // 确保清理旧容器，防止重复初始化报错
        const container = document.getElementById('cf-turnstile-container');
        container.innerHTML = ''; 

        if (window.turnstile) {
            turnstile.render('#cf-turnstile-container', {
                sitekey: '0x4AAAAAACnoEaLGtiIzO2nF',
                callback: (token) => {
                    window.onTurnstileSuccess(token);
                },
                'error-callback': (code) => {
                    console.error('Turnstile 报错:', code);
                    // 如果还报错，至少给个提示
                }
            });
        }
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