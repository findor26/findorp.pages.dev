/* 变量使用英文，注释仅说明“为什么” */
window.pendingUrl = '';

/**
 * 外部调用的验证触发函数
 */
window.verifyPassword = function(url) {
    window.pendingUrl = url;
    const dialog = document.getElementById('pw-dialog');
    if (dialog) {
        dialog.style.display = 'flex';
        /* 延迟聚焦确保移动端虚拟键盘能正常唤起 */
        setTimeout(() => {
            const input = document.getElementById('pw-input');
            if (input) input.focus();
        }, 50);
    }
};

/**
 * 关闭并清理状态
 */
window.closeDialog = function() {
    const form = document.getElementById('pw-form');
    if (form) form.reset();
    document.getElementById('pw-dialog').style.display = 'none';
    window.pendingUrl = '';
};

/**
 * 执行下载验证
 */
window.confirmPassword = function() {
    const inputField = document.getElementById('pw-input');
    /* 使用 trim() 去除输入首尾可能的空格（如手机输入法自动补全的空格） */
    const input = inputField ? inputField.value.trim() : '';
    
    /* 解码预设密码: dG9kYmdmZDI2 -> todbgfd26 */
    const correctKey = atob('dG9kYmdmZDI2'); 

    if (input === correctKey) {
        /* 使用隐藏的 a 标签触发下载，以避开部分浏览器对 location.href 的拦截 */
        const link = document.createElement('a');
        link.href = window.pendingUrl;
        link.download = ''; 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.closeDialog();
    } else {
        alert("验证码不正确");
        if (inputField) {
            inputField.value = '';
            inputField.focus();
        }
    }
};