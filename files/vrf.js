window.pendingUrl = "";
window.cfToken = "";

window.verifyPassword = function(fileName) {
    window.pendingUrl = fileName;
    const dialog = document.getElementById('password-dialog');
    if (dialog) {
        dialog.style.display = 'flex';
        document.getElementById('pw-input').value = "";
        if (typeof turnstile !== 'undefined') {
            turnstile.reset();
        }
    }
};

window.closeDialog = function() {
    const dialog = document.getElementById('password-dialog');
    if (dialog) dialog.style.display = 'none';
    window.pendingUrl = "";
};

window.onTurnstileSuccess = function(token) {
    window.cfToken = token;
};

window.confirmPassword = async function() {
    const password = document.getElementById('pw-input').value.trim();
    const btn = document.getElementById('submit-btn');

    if (!password || !window.cfToken) return;

    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = "正在提取...";

    try {
        const response = await fetch('/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: password,
                token: window.cfToken,
                fileName: window.pendingUrl
            })
        });

        if (response.ok) {
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = window.pendingUrl;
            document.body.appendChild(link);
            link.click();
            
            // 释放内存占用
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
            window.closeDialog();
        } else {
            const errorData = await response.json();
            alert(errorData.error || "验证失败");
            if (typeof turnstile !== 'undefined') turnstile.reset();
            window.cfToken = "";
        }
    } catch (err) {
        alert("连接异常");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
};

document.addEventListener('keydown', (e) => {
    const dialog = document.getElementById('password-dialog');
    if (dialog && dialog.style.display === 'flex' && e.key === 'Enter') {
        window.confirmPassword();
    }
});