// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 拦截非 WebSocket 请求
    if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("此接口仅支持 WebSocket 连接 (Gemini Live API).", { status: 426 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response("服务器未配置 API Key", { status: 500 });
    }

    // ⭐️ 核心修正：Cloudflare fetch 出站握手必须使用 https:// 协议，而不是 wss://
    // 即使使用 https://，只要请求头里带有 Upgrade: websocket，Cloudflare 就会自动建立 WebSocket 链接
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 2. 清理请求头，防止防火墙或域冲突拦截
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.delete("Host");
    proxyHeaders.delete("Origin");
    proxyHeaders.delete("Referer");

    // 3. 构造出站请求
    const proxyRequest = new Request(targetUrl, {
        method: "GET", // WebSocket 升级握手本质上是一个带有特定 Header 的 GET 请求
        headers: proxyHeaders
    });

    // 4. 发起请求并返回，Cloudflare 会自动完成双向 WebSocket 桥接
    return fetch(proxyRequest);
}
