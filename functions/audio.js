// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 拦截非 WebSocket 请求 (保留自检诊断功能)
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

    // 2. 正常 WebSocket 代理流 (采用最标准的单行透明转发)
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response("服务器未配置 API Key", { status: 500 });
    }

    // ⭐️ 核心对齐 1：同传双向流 Live API 仅存在于 v1alpha 命名空间下
    // ⭐️ 核心对齐 2：使用 https:// 作为出站 fetch 的目标前缀，规避 CF 报错崩溃
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // ⭐️ 核心对齐 3：透明转发原始 request。
    // 这将在 Cloudflare 最底层自动握手并代理这条长连接同传通道，彻底消除 25 秒超时和挂起。
    return fetch(targetUrl, request);
}
