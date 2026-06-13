// 文件路径: functions/audio.js

// CORS 头设置，允许跨域请求
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
    const { request, env } = context;

    // 1. 处理 CORS 预检请求 (OPTIONS)
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // 2. 检查环境变量中的 API KEY
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: '服务器未配置 API Key', code: 'NO_API_KEY' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    // 3. 仅允许 POST 请求
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    try {
        // 读取前端发来的完整 Payload
        const requestBody = await request.text();

        // 🎯 强制指定调用的模型为 gemini-3.5-live-translate-preview
        const MODEL = 'gemini-3.5-live-translate-preview';
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

        // 4. 将请求转发给 Google Gemini API
        const geminiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: requestBody // 直接把前端组装好的 payload 透传过去
        });

        const data = await geminiResponse.text();

        // 5. 将 Gemini 的响应返回给前端
        return new Response(data, {
            status: geminiResponse.status,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: '代理请求失败: ' + error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}
