// functions/translate-audio.js

export async function onRequest(context) {
    const { request, env } = context;

    // 处理跨域请求 (CORS)
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // 从环境变读取您的 Gemini API Key
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: '服务端未配置 GEMINI_API_KEY' }), { status: 500 });
    }

    // 接收前端通过 POST 发送过来的原始 PCM 二进制音频
    const pcmBuffer = await request.arrayBuffer();

    // 构建 SSE 流回写器
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    function sendSSE(event, data) {
        writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }

    try {
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

        // Cloudflare Worker 中发起对外部的 WebSocket 连接必须使用 Upgrade 头
        const wsResponse = await fetch(url, {
            headers: { "Upgrade": "websocket", "Connection": "Upgrade" }
        });

        if (wsResponse.status !== 101) {
            const errText = await wsResponse.text();
            sendSSE('error', `无法连接 Google API: ${wsResponse.status} ${errText}`);
            writer.close();
            return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
        }

        const ws = wsResponse.webSocket;
        ws.accept();

        let isDone = false;

        // 监听 Google 传回的消息
        ws.addEventListener("message", (event) => {
            try {
                const msg = JSON.parse(event.data);
                const content = msg.serverContent;
                if (content) {
                    // 派发实时翻译文本
                    if (content.outputTranscription?.text) {
                        sendSSE('transcription', content.outputTranscription.text);
                    }
                    // 派发翻译合成音频的 Base64 块
                    if (content.modelTurn?.parts) {
                        for (const part of content.modelTurn.parts) {
                            if (part.inlineData?.data) {
                                sendSSE('audio', part.inlineData.data);
                            }
                        }
                    }
                    // 检测 Google 是否通知当前回合已翻译完毕
                    if (content.turnComplete) {
                        isDone = true;
                        sendSSE('done', 'success');
                        ws.close();
                    }
                }
            } catch (e) {
                // 忽略解析错误
            }
        });

        ws.addEventListener("close", () => {
            if (!isDone) sendSSE('done', 'closed');
            writer.close();
        });

        ws.addEventListener("error", () => {
            sendSSE('error', 'Google WebSocket 连接发生错误');
            writer.close();
        });

        // 1. 发送初始化配置参数 (仅保留中文简体，不启用回声)
        ws.send(JSON.stringify({
            setup: {
                model: "models/gemini-3.5-live-translate-preview",
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    outputAudioTranscription: {},
                    translationConfig: {
                        targetLanguageCode: "zh-Hans",
                        echoTargetLanguage: false
                    }
                }
            }
        }));

        // 2. 异步流式按 100ms 发送音频块 (Cloudflare 代劳)
        (async () => {
            const uint8 = new Uint8Array(pcmBuffer);
            const chunkSize = 1600; // 16kHz * 0.1s = 1600 个字节
            let offset = 0;

            function bufferToBase64(buf) {
                let binary = '';
                for (let i = 0; i < buf.length; i++) {
                    binary += String.fromCharCode(buf[i]);
                }
                return btoa(binary);
            }

            while (offset < uint8.length) {
                // 实时向前端通知处理进度
                sendSSE('progress', {
                    ratio: offset / uint8.length,
                    currentSec: offset / 16000,
                    totalSec: uint8.length / 16000
                });

                const chunk = uint8.subarray(offset, offset + chunkSize);
                ws.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{
                            mimeType: "audio/pcm;rate=16000",
                            data: bufferToBase64(chunk)
                        }]
                    }
                }));
                offset += chunkSize;
                
                // 强制限速 100ms 模拟实时语音流
                await new Promise(r => setTimeout(r, 100)); 
            }

            sendSSE('progress', { ratio: 1, currentSec: uint8.length/16000, totalSec: uint8.length/16000 });
            sendSSE('upload_complete', true);

            // 发送客户端结束标记，提示模型不需要再等后续音频了
            ws.send(JSON.stringify({
                clientContent: { turnComplete: true }
            }));
        })();

    } catch (e) {
        sendSSE('error', e.message);
        writer.close();
    }

    // 将 SSE 流直接返回给浏览器
    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
