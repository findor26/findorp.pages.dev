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

    // 2. 目标官方接口地址
    const targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 3. ⭐️ 核心修复：清理请求头
    // 不能把浏览器的 Host 和 Origin 直接传给 Google，否则会被防火墙拦截
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.delete("Host");
    proxyHeaders.delete("Origin");
    proxyHeaders.delete("Referer");

    // 4. 创建纯净的转发请求并返回给 Cloudflare 进行代理
    const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: proxyHeaders
    });

    return fetch(proxyRequest);
}
