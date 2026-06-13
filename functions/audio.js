// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 拦截非 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("此接口仅支持 WebSocket 连接 (Gemini Live API).", { status: 426 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response("服务器未配置 API Key", { status: 500 });
    }

    // ⭐️ 核心修正 1：必须使用官方最新的 v1beta 接口
    // ⭐️ 核心修正 2：必须使用 wss:// 协议进行安全的出站 WebSocket 握手
    const targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 3. ⭐️ 终极透明代理：直接转发原始 request
    // Cloudflare 会保留全部 WebSocket 升级上下文，自动重写 Host 头，并透明传递握手状态。
    return fetch(targetUrl, request);
}
