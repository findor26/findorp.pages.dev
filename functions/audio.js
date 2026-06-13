// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 检查是否为 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
        const apiKey = env.GEMINI_API_KEY;
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

    // 2. ⭐️ 核心逻辑：正常 WebSocket 代理流 (采用 WebSocketPair)
    const apiKey = env.GEMINI_API_KEY;
    
    // ⭐️ 必须对准 v1beta 接口，且在 fetch 内以 https:// 开头
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 创建本地 WebSocket 对，用于和浏览器建立连接
    const [clientWS, serverWS] = Object.values(new WebSocketPair());
    serverWS.accept(); // 立即接受浏览器的连接，防止前端一直卡在 Connecting

    try {
        // 向 Google 发起最干净的出站 WebSocket 连接（只带必要的升级头部，阻断 Origin 和 Host 污染）
        const googleResponse = await fetch(targetUrl, {
            headers: {
                "Upgrade": "websocket"
            }
        });

        const googleWS = googleResponse.webSocket;
        if (!googleWS) {
            serverWS.close(1011, "Google 拒绝了出站 WebSocket 升级（可能是握手被拒）");
            return new Response(null, { status: 101, webSocket: clientWS });
        }

        // 接受 Google 的连接
        googleWS.accept();

        // 双向管道极速数据转发
        serverWS.addEventListener("message", (event) => {
            if (googleWS.readyState === 1) {
                googleWS.send(event.data);
            }
        });

        googleWS.addEventListener("message", (event) => {
            if (serverWS.readyState === 1) {
                serverWS.send(event.data);
            }
        });

        serverWS.addEventListener("close", (event) => {
            googleWS.close(event.code, event.reason);
        });

        googleWS.addEventListener("close", (event) => {
            serverWS.close(event.code, event.reason);
        });

        serverWS.addEventListener("error", () => {
            googleWS.close(1011, "Client tunnel error");
        });

        googleWS.addEventListener("error", () => {
            serverWS.close(1011, "Google tunnel error");
        });

    } catch (err) {
        // ⭐️ 核心优化：若连接 Google 失败，通过连接关闭帧将“真实错误信息”直接发送并弹窗在前端！
        serverWS.close(1011, "代理连接 Google 失败: " + err.message);
    }

    // 返回 101 Switching Protocols 给浏览器
    return new Response(null, {
        status: 101,
        webSocket: clientWS
    });
}
