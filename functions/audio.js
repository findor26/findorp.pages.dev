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

    // 2. 目标官方 WebSocket 接口地址 (fetch 出站必须使用 https:// 协议)
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 3. 创建 Cloudflare 内部的 WebSocket 双端
    const [clientWS, serverWS] = Object.values(new WebSocketPair());
    
    // 接受浏览器（客户端）端的连接
    serverWS.accept();

    // 4. 构建纯净的、发往 Google 的握手请求头（抹除浏览器 Origin，防止被 Google 拒绝）
    const googleHeaders = new Headers();
    googleHeaders.set("Upgrade", "websocket");
    googleHeaders.set("Connection", "Upgrade");

    try {
        // 5. 代理主动连接 Google
        const googleResponse = await fetch(targetUrl, {
            headers: googleHeaders
        });

        const googleWS = googleResponse.webSocket;
        if (!googleWS) {
            serverWS.close(1011, "Google 拒绝了 WebSocket 升级请求");
            return new Response(null, { status: 101, webSocket: clientWS });
        }

        // 接受 Google 端的连接
        googleWS.accept();

        // 6. ⭐️ 核心：双向管道数据抽水转发 (Piping)
        
        // 浏览器 -> 代理 -> Google
        serverWS.addEventListener("message", (event) => {
            if (googleWS.readyState === 1) { // OPEN
                googleWS.send(event.data);
            }
        });

        // Google -> 代理 -> 浏览器
        googleWS.addEventListener("message", (event) => {
            if (serverWS.readyState === 1) { // OPEN
                serverWS.send(event.data);
            }
        });

        // 监听连接关闭事件，保持同步断开
        serverWS.addEventListener("close", (event) => {
            googleWS.close(event.code, event.reason);
        });

        googleWS.addEventListener("close", (event) => {
            serverWS.close(event.code, event.reason);
        });

        // 异常处理
        serverWS.addEventListener("error", () => {
            googleWS.close(1011, "Client tunnel error");
        });

        googleWS.addEventListener("error", () => {
            serverWS.close(1011, "Google tunnel error");
        });

    } catch (err) {
        // 如果在握手阶段就发生错误（如 API Key 错误），把错误消息发给前端
        serverWS.close(1011, "代理连接 Google 失败: " + err.message);
    }

    // 7. 返回 101 Switching Protocols 响应给浏览器
    return new Response(null, {
        status: 101,
        webSocket: clientWS
    });
}
