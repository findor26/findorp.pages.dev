// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;
    const apiKey = env.GEMINI_API_KEY;

    // ⭐️ 诊断自检模式：如果不是由前端页面发起的 WebSocket 升级请求，执行系统自检
    if (request.headers.get("Upgrade") !== "websocket") {
        const diagnostics = {
            cloudflare_worker_status: "正常运行 (Active)",
            api_key_configured: !!apiKey,
            google_api_test: null
        };

        if (!apiKey) {
            return new Response(JSON.stringify({
                status: "error",
                message: "后端未配置 GEMINI_API_KEY 环境变量，请在 Cloudflare 仪表盘中检查 Settings -> Variables",
                diagnostics: diagnostics
            }, null, 2), {
                status: 500,
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }

        // 测试向 Google API 发起请求，验证 Key 的有效性及网络区域限制
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
                // 如果是 Google 拒绝了（比如 Key 错、地区锁、欠费等），直接把 Google 的原装错误 JSON 吐在页面上
                diagnostics.google_api_test = {
                    status: "失败 (Failed)",
                    error_from_google: testData
                };
                return new Response(JSON.stringify({
                    status: "error",
                    message: "🚨 Google 拒绝了你的请求。请查看下方来自 Google 的详细错误原因：",
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
                message: "代理服务器无法建立与 Google 的连接，请确认 Cloudflare 区域网络或代理配置是否正常。",
                diagnostics: diagnostics
            }, null, 2), {
                status: 500,
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }
    }

    // --- 以下为正常的 WebSocket 代理流 ---
    if (!apiKey) {
        return new Response("未配置 API Key", { status: 500 });
    }

    // 目标官方最新 v1beta 接口
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // 原生转发
    return fetch(targetUrl, request);
}
