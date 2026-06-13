// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;
    const apiKey = env.GEMINI_API_KEY;

    if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("代理服务器正常运行。请通过网页前端建立 WebSocket 同传连接。", { status: 200 });
    }

    if (!apiKey) {
        return new Response("服务器未配置 API Key", { status: 500 });
    }

    // ⭐️ 核心对齐：对准官方的 v1alpha 同传端点
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    const [clientWS, serverWS] = Object.values(new WebSocketPair());

    try {
        // 1. 代理先去向 Google 发起纯净的握手请求 (阻断 Origin 污染)
        const googleResponse = await fetch(targetUrl, {
            headers: {
                "Upgrade": "websocket",
                "Host": "generativelanguage.googleapis.com"
            }
        });

        if (googleResponse.status !== 101) {
            const errText = await googleResponse.text();
            return new Response(`Google 拒绝了代理的连接 [${googleResponse.status}]: ${errText.slice(0, 100)}`, { status: 502 });
        }

        const googleWS = googleResponse.webSocket;

        // 2. ⭐️ 核心时序修复：只有当 Google 明确连接成功后，才同时激活双向通道！
        // 这样你的手机发出 Setup 配置包时，Google 绝对能百分之百收到，彻底消灭死锁挂起！
        googleWS.accept();
        serverWS.accept(); 

        // 3. 极速双向数据管道分发
        serverWS.addEventListener("message", (e) => {
            googleWS.send(e.data);
        });

        googleWS.addEventListener("message", (e) => {
            serverWS.send(e.data);
        });

        serverWS.addEventListener("close", (e) => {
            googleWS.close(e.code, e.reason);
        });

        googleWS.addEventListener("close", (e) => {
            serverWS.close(e.code, e.reason);
        });

        serverWS.addEventListener("error", () => {
            googleWS.close(1011, "Client error");
        });

        googleWS.addEventListener("error", () => {
            serverWS.close(1011, "Google WS error");
        });

    } catch (err) {
        return new Response(`代理连接失败: ${err.message}`, { status: 502 });
    }

    // 4. 将成功建立桥接的线路返回给手机
    return new Response(null, {
        status: 101,
        webSocket: clientWS
    });
}
