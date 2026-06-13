// 文件路径: functions/audio.js

export async function onRequest(context) {
    const { request, env } = context;
    const apiKey = env.GEMINI_API_KEY;

    // 处理预检请求
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
        return new Response(JSON.stringify({ error: "仅支持 POST 请求" }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    if (!apiKey) {
        return new Response(JSON.stringify({ error: "服务器未配置 API Key" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    try {
        const body = await request.json();
        const { pcmDataB64 } = body;

        if (!pcmDataB64) {
            return new Response(JSON.stringify({ error: "未接收到音频数据" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // 将前端上传的 Base64 字节流还原为标准的 16-bit PCM 数组
        const binary = atob(pcmDataB64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const pcmData = new Int16Array(bytes.buffer);

        // 🎯 目标 Google 官方同传专属 WebSocket 端点 (Live API 支持 v1alpha 通道)
        const targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

        // 在 Cloudflare 服务器后台建立与 Google 的同传双向管道，并返回最终收集结果
        const translatedChunks = await new Promise((resolve, reject) => {
            // ⭐️ 利用 Cloudflare Workers 官方原生出站 WebSocket 实例
            const googleWS = new WebSocket(targetUrl);
            const receivedChunks = [];

            // 异常超时保护（最大等待 25 秒）
            const timeout = setTimeout(() => {
                googleWS.close();
                reject(new Error("Google 传译响应超时"));
            }, 25000);

            googleWS.addEventListener("open", () => {
                // ⭐️ 发送针对 gemini-3.5-live-translate-preview 模型的专属同传配置
                googleWS.send(JSON.stringify({
                    setup: {
                        model: "models/gemini-3.5-live-translate-preview",
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            translationConfig: {
                                targetLanguageCode: "zh-Hans", // 简体中文
                                echoTargetLanguage: false
                            }
                        }
                    }
                }));
            });

            googleWS.addEventListener("message", async (e) => {
                const msg = JSON.parse(e.data);

                // Setup 成功，利用服务器间骨干网，瞬间把整个音频所有切片全部推给 Google
                if (msg.setupComplete) {
                    const CHUNK_SIZE = 4096;
                    for (let i = 0; i < pcmData.length; i += CHUNK_SIZE) {
                        const chunk = pcmData.subarray(i, i + CHUNK_SIZE);
                        const uint8 = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
                        
                        let chunkBinary = '';
                        for (let j = 0; j < uint8.length; j++) {
                            chunkBinary += String.fromCharCode(uint8[j]);
                        }

                        googleWS.send(JSON.stringify({
                            realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: btoa(chunkBinary) }] }
                        }));
                    }
                    // 音频传输完毕，通知 Google 结束
                    googleWS.send(JSON.stringify({ clientContent: { turnComplete: true, turns: [] } }));
                }

                // 收集传回的翻译音频 Base64 碎片
                if (msg.serverContent?.modelTurn?.parts) {
                    msg.serverContent.modelTurn.parts.forEach(part => {
                        if (part.inlineData && part.inlineData.data) {
                            receivedChunks.push(part.inlineData.data);
                        }
                    });
                }

                // Google 翻译完毕并生成语音
                if (msg.serverContent?.turnComplete) {
                    clearTimeout(timeout);
                    googleWS.close();
                    resolve(receivedChunks);
                }
            });

            googleWS.addEventListener("close", (e) => {
                clearTimeout(timeout);
                if (e.code !== 1000 && e.code !== 1005) {
                    reject(new Error(`Google 连接被拒 [代码 ${e.code}]: ${e.reason || '无原因'}`));
                } else {
                    resolve(receivedChunks);
                }
            });

            googleWS.addEventListener("error", () => {
                clearTimeout(timeout);
                reject(new Error("与 Google 服务器连接发生错误"));
            });
        });

        // 将收集齐的所有音频 Base64 切片，通过 HTTP 响应一次性安全地回传给浏览器
        return new Response(JSON.stringify({ status: "success", chunks: translatedChunks }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
