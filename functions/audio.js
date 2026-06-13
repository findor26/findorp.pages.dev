// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 检查是否为 WebSocket 升级请求 (Live API 必须使用 WebSocket)
    if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("This endpoint strictly requires a WebSocket connection for Gemini Live API.", { status: 426 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response("服务器未配置 API Key", { status: 500 });
    }

    // 2. 指向 Google Gemini Bidi (双向流) 官方接口
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 3. 将你的 WebSocket 客户端直接桥接到 Google
    return fetch(url, {
        headers: request.headers
    });
}
