let pendingUrl = '';

/**
 * 唤起验证弹窗并记录目标路径
 */
function verifyPassword(url) {
    pendingUrl = url;
    const dialog = document.getElementById('pw-dialog');
    dialog.style.display = 'flex';
    
    /* 自动聚焦确保手机端直接唤起键盘 */
    const inputField = document.getElementById('pw-input');
    if (inputField) inputField.focus();
}

/**
 * 重置表单并关闭弹窗
 */
function closeDialog() {
    const form = document.getElementById('pw-form');
    if (form) form.reset();
    document.getElementById('pw-dialog').style.display = 'none';
    pendingUrl = '';
}

/**
 * 核心验证逻辑
 */
function confirmPassword() {
    const input = document.getElementById('pw-input').value;
    
    /* 使用 Base64 存储 todbgfd26 以防止源码直读 */
    const correctKey = atob('dG9kYmdmZDI2'); 

    /* 验证通过执行跳转，失败则清空输入 */
    if (input === correctKey) {
        window.location.href = pendingUrl;
        closeDialog();
    } else {
        alert("密码错误");
        const inputField = document.getElementById('pw-input');
        if (inputField) {
            inputField.value = '';
            inputField.focus();
        }
    }
}