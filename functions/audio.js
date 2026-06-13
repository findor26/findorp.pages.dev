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

    // 2. 目标官方接口地址 (fetch 出站必须使用 https 协议)
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 3. ⭐️ 核心修正：使用 Cloudflare 官方标准 WebSocket 代理写法
    // 直接传入原始的 request 实例。
    // Cloudflare 会保留升级状态，并且会自动修正目标 Host，彻底解决 1006 异常断开问题。
    return fetch(targetUrl, request);
}
