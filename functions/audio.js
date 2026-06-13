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

    // ⭐️ 核心修正 1：对于 3.5 传译模型，必须使用官方最新的 v1beta 接口
    // ⭐️ 核心修正 2：在 fetch 中连接外部 WebSocket，必须写 https:// 协议
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 2. ⭐️ 核心修正 3：创建本地 WebSocket 对，手动接管浏览器连接
    const [clientWS, serverWS] = Object.values(new WebSocketPair());
    serverWS.accept(); // 接受浏览器的连接

    try {
        // 3. ⭐️ 核心修正 4：向 Google 发起极其纯净的出站 WebSocket 连接（只带核心 Upgrade 头，拒绝请求头污染）
        const googleResponse = await fetch(targetUrl, {
            headers: {
                "Upgrade": "websocket"
            }
        });

        const googleWS = googleResponse.webSocket;
        if (!googleWS) {
            serverWS.close(1011, "Google 拒绝了 WebSocket 升级请求");
            return new Response(null, { status: 101, webSocket: clientWS });
        }

        // 4. 接受 Google 端连接
        googleWS.accept();

        // 5. ⭐️ 核心修正 5：双向高速管道转发 (手动抽水转发)
        
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

        // 同步关闭事件
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
        // 如果失败，会直接把具体的错误原因抛给前端
        serverWS.close(1011, "代理连接 Google 失败: " + err.message);
    }

    // 6. 向浏览器返回 101 Switching Protocols 响应
    return new Response(null, {
        status: 101,
        webSocket: clientWS
    });
}
