// functions/api/ws.js

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 检查前端发来的是否为 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response("服务端未配置 GEMINI_API_KEY", { status: 500 });
    }

    // 2. 构建目标 Google API 地址
    // 注意：在 Cloudflare 中必须使用 https:// 来建立 WebSocket 连接
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 3. 复制原始请求，指向 Google，Cloudflare 会自动完成 WebSocket 的透明代理和协议升级
    const proxyRequest = new Request(targetUrl, request);

    return fetch(proxyRequest);
}
