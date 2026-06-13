// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;
    const apiKey = env.GEMINI_API_KEY;

    // 1. 诊断自检模式 (如果不是 WebSocket 升级，则执行 HTTP 自检)
    if (request.headers.get("Upgrade") !== "websocket") {
        const diagnostics = {
            cloudflare_worker_status: "正常运行 (Active)",
            api_key_configured: !!apiKey,
            google_api_test: null
        };

        if (!apiKey) {
            return new Response(JSON.stringify({
                status: "error",
                message: "后端未配置 GEMINI_API_KEY 环境变量",
                diagnostics: diagnostics
            }, null, 2), {
                status: 500,
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }

        try {
            const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const testResponse = await fetch(testUrl);
            const testData = await testResponse.json();

            if (testResponse.ok) {
                diagnostics.google_api_test = {
                    status: "成功 (Success)",
                    message: "API Key 有效，且代理服务器成功连接到了 Google API",
                    available_models_sample: testData.models ? testData.models.slice(0, 3).map(m => m.name) : []
                };
                return new Response(JSON.stringify({
                    status: "success",
                    message: "🎉 后端自检通过！接口一切正常，请在前端页面中上传文件进行翻译。",
                    diagnostics: diagnostics
                }, null, 2), {
                    status: 200,
                    headers: { "Content-Type": "application/json; charset=utf-8" }
                });
            } else {
                diagnostics.google_api_test = {
                    status: "失败 (Failed)",
                    error_from_google: testData
                };
                return new Response(JSON.stringify({
                    status: "error",
                    message: "Google 拒绝了你的请求。请查看下方来自 Google 的详细错误原因：",
                    diagnostics: diagnostics
                }, null, 2), {
                    status: 400,
                    headers: { "Content-Type": "application/json; charset=utf-8" }
                });
            }
        } catch (err) {
            diagnostics.google_api_test = {
                status: "异常 (Exception)",
                error_message: err.message
            };
            return new Response(JSON.stringify({
                status: "error",
                message: "代理服务器无法建立与 Google 的连接。",
                diagnostics: diagnostics
            }, null, 2), {
                status: 500,
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }
    }

    // 2. ⭐️ 核心逻辑：双向流 Live API 代理转发 (采用 Cloudflare 官方原生出站 WebSocket 连接)
    if (!apiKey) {
        return new Response("服务器未配置 API Key", { status: 500 });
    }

    // 对准 v1beta 接口下的 BidiGenerateContent 传译端点
    const targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 创建本地 WebSocket 对，与浏览器端握手
    const [clientWS, serverWS] = Object.values(new WebSocketPair());
    serverWS.accept(); // 立即接受浏览器的连接，防止前端 Pending 卡死

    // ⭐️ 核心：在 Cloudflare 后端直接发起指向 Google 的原生出站加密 WebSocket
    const googleWS = new WebSocket(targetUrl);

    // 数据缓存队列，防止 Google WebSocket 尚未 Open 时丢失前端发来的 Setup 配置
    let pendingMessages = [];

    googleWS.addEventListener("open", () => {
        // 连接建立后，一次性发送积压的所有数据帧
        for (const msg of pendingMessages) {
            if (googleWS.readyState === 1) {
                googleWS.send(msg);
            }
        }
        pendingMessages = [];
    });

    // 浏览器 -> 代理 -> Google
    serverWS.addEventListener("message", (event) => {
        if (googleWS.readyState === 1) { // OPEN
            googleWS.send(event.data);
        } else {
            pendingMessages.push(event.data);
        }
    });

    // Google -> 代理 -> 浏览器
    googleWS.addEventListener("message", (event) => {
        if (serverWS.readyState === 1) { // OPEN
            serverWS.send(event.data);
        }
    });

    // 同步断开与关闭
    serverWS.addEventListener("close", (event) => {
        googleWS.close(event.code, event.reason);
    });

    googleWS.addEventListener("close", (event) => {
        serverWS.close(event.code, event.reason);
    });

    // 错误同步
    serverWS.addEventListener("error", () => {
        googleWS.close(1011, "Client tunnel error");
    });

    googleWS.addEventListener("error", () => {
        serverWS.close(1011, "Google tunnel error");
    });

    // 返回 101 Switching Protocols 给浏览器
    return new Response(null, {
        status: 101,
        webSocket: clientWS
    });
}
