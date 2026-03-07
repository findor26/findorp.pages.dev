window.pendingUrl = "";
window.cfToken = "";

window.verifyPassword = function(fileName) {
    window.pendingUrl = fileName;
    const dialog = document.getElementById('password-dialog');
    if (dialog) {
        dialog.style.display = 'flex';
        document.getElementById('pw-input').value = "";
        if (typeof turnstile !== 'undefined') turnstile.reset();
    }
};

window.closeDialog = function() {
    const dialog = document.getElementById('password-dialog');
    if (dialog) dialog.style.display = 'none';
};

window.onTurnstileSuccess = function(token) {
    window.cfToken = token;
};

window.confirmPassword = async function() {
    const password = document.getElementById('pw-input').value.trim();
    const btn = document.getElementById('submit-btn');

    if (!password || !window.cfToken) return;

    btn.disabled = true;
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
            const data = await response.json();
            // 直接通过隐藏链接触发下载
            const link = document.createElement('a');
            link.href = data.url;
            link.download = window.pendingUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.closeDialog();
        } else {
            const errorData = await response.json();
            alert(errorData.error || "验证失败");
            if (typeof turnstile !== 'undefined') turnstile.reset();
        }
    } catch (err) {
        alert("网络异常");
    } finally {
        btn.disabled = false;
    }
};