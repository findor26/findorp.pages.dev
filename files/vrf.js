window.pendingUrl = '';

window.verifyPassword = function(url) {
    window.pendingUrl = url;
    const dialog = document.getElementById('pw-dialog');
    if (dialog) {
        dialog.style.display = 'flex';
        setTimeout(() => {
            const input = document.getElementById('pw-input');
            if (input) input.focus();
        }, 50);
    }
};

window.closeDialog = function() {
    const form = document.getElementById('pw-form');
    if (form) form.reset();
    document.getElementById('pw-dialog').style.display = 'none';
};

window.confirmPassword = function() {
    const inputField = document.getElementById('pw-input');
    const input = inputField ? inputField.value.trim() : '';
    
    /* 解码校验：dG9kYmdmZDI2 -> todbgfd26 */
    const correctKey = atob('dG9kYmdmZDI2'); 

    if (input === correctKey) {
        /* 创建临时锚点以触发文件流下载，避免 URL 参数污染 */
        const downloader = document.createElement('a');
        downloader.href = window.pendingUrl;
        downloader.setAttribute('download', ''); 
        document.body.appendChild(downloader);
        downloader.click();
        document.body.removeChild(downloader);
        
        window.closeDialog();
    } else {
        alert("密码错误");
        if (inputField) {
            inputField.value = '';
            inputField.focus();
        }
    }
};