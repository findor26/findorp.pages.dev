/* 变量命名：英文；注释：说明“为什么” */
let targetFilePath = '';

document.addEventListener('DOMContentLoaded', () => {
    const fileLinks = document.querySelectorAll('.file-item');
    const pwForm = document.getElementById('pw-form');
    const btnCancel = document.getElementById('btn-cancel');
    const pwInput = document.getElementById('pw-input');
    const dialog = document.getElementById('pw-dialog');

    /* 遍历所有资源项，改用监听器捕获点击，避免内联脚本被 CSP 拦截 */
    fileLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            /* 阻止默认跳转，改为触发验证流程 */
            e.preventDefault();
            const url = link.getAttribute('data-url') || link.getAttribute('href');
            if (url && url !== 'javascript:void(0)') {
                targetFilePath = url;
                dialog.style.display = 'flex';
                pwInput.focus();
            }
        });
    });

    /* 处理表单提交，使用监听器替代 HTML 中的 onsubmit */
    pwForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const correctKey = atob('dG9kYmdmZDI2'); /* 混淆存储的密码 */
        
        if (pwInput.value === correctKey) {
            window.location.href = targetFilePath;
            resetAndClose();
        } else {
            alert("验证未通过");
            pwInput.value = '';
        }
    });

    /* 取消按钮逻辑 */
    btnCancel.addEventListener('click', resetAndClose);

    function resetAndClose() {
        pwForm.reset();
        dialog.style.display = 'none';
        targetFilePath = '';
    }
});