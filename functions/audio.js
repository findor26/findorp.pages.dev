// 文件路径: functions/audioTranslate.js

export async function onRequest(context) {
    const { request, env } = context;
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
        return jsonResponse({ error: '服务器未配置 API Key', code: 'NO_API_KEY' }, 500);
    }

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            }
        });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: '仅支持 POST 请求', code: 'METHOD_NOT_ALLOWED' }, 405);
    }

    try {
        const body = await request.json();
        const { model, contents, generationConfig } = body;

        if (!model) {
            return jsonResponse({ error: '未指定模型', code: 'INVALID_MODEL' }, 400);
        }

        // 拼接标准的 Google Gemini REST 接口 (使用 v1beta)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 向 Google 转发请求
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig
            })
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json().catch(() => ({}));
            return jsonResponse({ error: errorData.error?.message || 'API 错误' }, geminiResponse.status);
        }

        const data = await geminiResponse.json();
        return jsonResponse(data, 200);

    } catch (err) {
        return jsonResponse({ error: '服务器内部错误', message: err.message }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status, 
        headers: { 
            'Content-Type': 'application/json; charset=utf-8', 
            'Access-Control-Allow-Origin': '*' 
        }
    });
}
