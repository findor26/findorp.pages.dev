// functions/api/ws.js

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 检查是否为 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response("服务端未配置 GEMINI_API_KEY", { status: 500 });
    }

    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    try {
        // 2. 发起与 Google 的 WebSocket 连接
        const response = await fetch(targetUrl, {
            headers: { "Upgrade": "websocket" }
        });

        // 如果 Google 拒绝了连接（比如 400 密钥错误、403 权限问题），把报错明文返回给前端
        if (response.status !== 101) {
            const errorText = await response.text();
            return new Response(`Google 拒绝连接 (${response.status}): ${errorText}`, {
                status: response.status
            });
        }

        return response;
    } catch (e) {
        return new Response(`代理连接失败: ${e.message}`, { status: 502 });
    }
}
