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

    // ⭐️ 核心修正 1：针对 3.5 同传模型，必须使用官方最新的 v1beta 接口
    // ⭐️ 核心修正 2：这里必须使用 https:// 协议（写 wss:// 会导致 Cloudflare 运行时崩溃报错）
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // ⭐️ 核心修正 3：极简原生转发！
    // 彻底放弃中间变量与手动管道（避免在容器中 Pending 卡死），直接返回原始 request 的 fetch。
    // Cloudflare 会在最底层自动处理并升级、转发 WebSocket 握手，消除一切中间挂起状态。
    return fetch(targetUrl, request);
}
