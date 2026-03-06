/* 全局变量用于存储待下载的文件路径 */
let pendingUrl = '';

/**
 * 触发密码验证弹窗
 * @param {string} url - 点击的文件链接地址
 */
function verifyPassword(url) {
    /* 记录目标地址并显示 MD3 风格对话框 */
    pendingUrl = url;
    const dialog = document.getElementById('pw-dialog');
    const inputField = document.getElementById('pw-input');
    
    dialog.style.display = 'flex';
    
    /* 自动聚焦输入框提升手机端交互体验 */
    if (inputField) {
        inputField.focus();
    }
}

/**
 * 关闭弹窗并清理状态
 */
function closeDialog() {
    const form = document.getElementById('pw-form');
    const dialog = document.getElementById('pw-dialog');
    
    /* 重置表单以清空已输入的密码字符 */
    if (form) {
        form.reset();
    }
    dialog.style.display = 'none';
    pendingUrl = '';
}

/**
 * 验证密码并执行下载
 * 此函数由表单的 onsubmit 事件触发
 */
function confirmPassword() {
    const inputField = document.getElementById('pw-input');
    const passwordValue = inputField ? inputField.value : '';
    
    /* 预设的提取密码 */
    const correctKey = atob('dG9kYmdmZDI2');

    /* 校验成功则跳转，失败则弹出提示并重置 */
    if (passwordValue === correctKey) {
        window.location.href = pendingUrl;
        closeDialog();
    } else {
        alert("密码错误");
        if (inputField) {
            inputField.value = '';
            inputField.focus();
        }
    }
}

/**
 * 页面布局修正：确保 Footer 始终位于底部
 * 即使在内容极少的情况下也能保持 MD3 视觉完整性
 */
window.addEventListener('DOMContentLoaded', () => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
        /* 动态赋予 main 元素自适应高度属性 */
        mainElement.style.flex = '1';
    }
    
    const bodyElement = document.body;
    if (bodyElement) {
        /* 确保 body 至少占满整个视口高度 */
        bodyElement.style.minHeight = '100vh';
        bodyElement.style.display = 'flex';
        bodyElement.style.flexDirection = 'column';
    }
});