// functions/translate.js

const ALLOWED_MODELS =[
    'gemini-flash-latest',
    'gemini-flash-lite-latest'
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ================= 全局缓存：动态获取外部词库 =================
let cachedDictPrompt = null;
let lastFetchTime = 0;

async function getDictPrompt() {
    const now = Date.now();
    if (cachedDictPrompt && (now - lastFetchTime < 3600000)) {
        return cachedDictPrompt;
    }
    
    let prompt = "【专有名词对照表】\n";
    try {
        const res = await fetch('https://raw.githubusercontent.com/Testanki1/testanki1.github.io/refs/heads/main/translations.js');
        const text = await res.text();
        
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        const block = (start !== -1 && end !== -1) ? text.substring(start, end + 1) : text;
        
        const lines = block.split('\n');
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;
            
            let keyRaw = line.slice(0, colonIdx).trim();
            let valRaw = line.slice(colonIdx + 1).trim();
            if (valRaw.endsWith(',')) valRaw = valRaw.slice(0, -1);
            
            const extractStr = (str) => {
                if (str.length >= 2) {
                    const quote = str[0];
                    if ((quote === "'" || quote === '"') && str[str.length - 1] === quote) {
                        return str.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
                    }
                }
                return null;
            };
            
            const key = extractStr(keyRaw);
            const val = extractStr(valRaw);
            
            if (key !== null && val !== null) {
                prompt += `英文 "${key}" 必须严格翻译为中文 "${val}"\n`;
            }
        }
        
        cachedDictPrompt = prompt;
        lastFetchTime = now;
        return prompt;
    } catch (e) {
        return cachedDictPrompt || prompt;
    }
}

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
        const { model, text } = body;

        if (!model || !ALLOWED_MODELS.includes(model)) {
            return jsonResponse({
                error: `不支持的模型: ${model || '未指定'}`,
                code: 'INVALID_MODEL',
                allowedModels: ALLOWED_MODELS
            }, 400);
        }

        if (!text && !body.contents) {
            return jsonResponse({ error: '请提供要翻译的文本', code: 'NO_TEXT' }, 400);
        }

        const geminiBody = {};
        const dictPrompt = await getDictPrompt();
        
        geminiBody.systemInstruction = {
            parts:[{
                text: `你是一个游戏聊天内容翻译工具。
你的任务只有：将输入的 JSON 对象中的外文句子翻译为中文。
【排版规则】：
1. 汉字与汉字之间不能有任何空格。
2. 汉字与外文（如英文字母、俄文字母）或数字之间必须包含一个半角空格。
【强制要求】：
输入是一个 JSON 对象，格式为 {"ID": "待翻译文本"}。
你必须返回一个合法 JSON 对象，格式为：{"ID": "翻译后的中文"}。
绝对不要输出 Markdown 代码块（禁止输出 \`\`\`json 等标记），只输出纯 JSON 字符串！
即使文本无法翻译或者无意义，也必须保留该 ID 并返回原文或空串，绝不允许漏掉任何一个 ID！
以下为专有名词对照词库：
${dictPrompt}`
            }]
        };

        if (body.contents) {
            geminiBody.contents = body.contents;
        } else {
            // text 已经是客户端发过来的 JSON 格式的字符串
            geminiBody.contents =[{
                parts:[{ text: text }]
            }];
        }

        const geminiUrl = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json().catch(() => ({}));
            return jsonResponse({ error: errorData.error?.message || 'API 错误' }, geminiResponse.status);
        }

        return new Response(geminiResponse.body, {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (err) {
        return jsonResponse({ error: '服务器内部错误', message: err.message }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
    });
}
