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
    const content = dialog.querySelector('div');
    
    if (dialog) {
        /* 重置验证状态并播放进入动画 */
        dialog.className = 'dialog-showing';
        content.className = 'dialog-content-showing';
        dialog.style.display = 'flex';
        
        /* 每次打开弹窗都尝试重置 Turnstile 状态 */
        if (window.turnstile) {
            turnstile.reset('#cf-turnstile-container');
            window.cfToken = '';
        }
        
        setTimeout(() => {
            const input = document.getElementById('pw-input');
            if (input) input.focus();
        }, 100);
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

window.confirmPassword = function() {
    /* 二次校验 Token */
    if (!window.cfToken) return;

    const inputField = document.getElementById('pw-input');
    const input = inputField ? inputField.value.trim() : '';
    const correctKey = atob('dG9kYmdmZDI2'); 

    if (input === correctKey) {
        /* 秘密文件夹隔离逻辑 */
        const secretPath = atob('X3N0b3JhZ2Vfc2VjcmV0XzhkMmYv'); 
        const fullUrl = secretPath + window.pendingUrl;

        const downloader = document.createElement('a');
        downloader.href = fullUrl;
        downloader.download = ''; 
        document.body.appendChild(downloader);
        downloader.click();
        document.body.removeChild(downloader);
        
        window.closeDialog();
    } else {
        alert("密码错误");
        /* 错误后强制重置验证码，要求用户重新校验 */
        if (window.turnstile) {
            turnstile.reset('#cf-turnstile-container');
            window.onTurnstileSuccess(''); // 重置按钮状态
        }
        if (inputField) {
            inputField.value = '';
            inputField.focus();
        }
    }
};