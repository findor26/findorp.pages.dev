// functions/api/translate-audio.js

export async function onRequest(context) {
    const { request, env } = context;

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

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: '服务端未配置 GEMINI_API_KEY' }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    // 接收整段 PCM 字节流
    const pcmBuffer = await request.arrayBuffer();

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    function sendSSE(event, data) {
        writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }

    // 修复点 1：在 Cloudflare 中连接 Google WebSocket，协议必须写 https:// 而不是 wss://
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    try {
        const wsResponse = await fetch(targetUrl, {
            headers: { "Upgrade": "websocket" }
        });

        if (wsResponse.status !== 101) {
            const errText = await wsResponse.text();
            sendSSE('error', `Google API 连接被拒绝 (${wsResponse.status}): ${errText}`);
            writer.close();
            return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
        }

        const ws = wsResponse.webSocket;
        ws.accept();

        let isDone = false;

        ws.addEventListener("message", (event) => {
            try {
                const msg = JSON.parse(event.data);
                const content = msg.serverContent;
                if (content) {
                    if (content.outputTranscription?.text) {
                        sendSSE('transcription', content.outputTranscription.text);
                    }
                    if (content.modelTurn?.parts) {
                        for (const part of content.modelTurn.parts) {
                            if (part.inlineData?.data) {
                                sendSSE('audio', part.inlineData.data);
                            }
                        }
                    }
                    if (content.turnComplete) {
                        isDone = true;
                        sendSSE('done', 'success');
                        ws.close();
                    }
                }
            } catch (e) {
                // 忽略解析错
            }
        });

        ws.addEventListener("close", (event) => {
            if (!isDone) {
                sendSSE('done', `closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
            }
            writer.close();
        });

        ws.addEventListener("error", () => {
            sendSSE('error', 'Google WebSocket 通道发生异常');
            writer.close();
        });

        // 修复点 2：将 inputAudioTranscription 移动到 setup 根层级，对齐官方协议
        ws.send(JSON.stringify({
            setup: {
                model: "models/gemini-3.5-live-translate-preview",
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    translationConfig: {
                        targetLanguageCode: "zh-Hans",
                        echoTargetLanguage: false
                    }
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {}
            }
        }));

        // 3. 在 Cloudflare 边缘端代劳：异步 10 倍速极速推流
        (async () => {
            const uint8 = new Uint8Array(pcmBuffer);
            const chunkSize = 1600; 
            let offset = 0;

            function bufferToBase64(buf) {
                let binary = '';
                for (let i = 0; i < buf.length; i++) {
                    binary += String.fromCharCode(buf[i]);
                }
                return btoa(binary);
            }

            while (offset < uint8.length) {
                // 流式向前端汇报 Cloudflare 在后端的推流进度
                sendSSE('progress', {
                    ratio: offset / uint8.length,
                    currentSec: offset / 16000,
                    totalSec: uint8.length / 16000
                });

                const chunk = uint8.subarray(offset, offset + chunkSize);
                ws.send(JSON.stringify({
                    realtimeInput: {
                        audio: {
                            mimeType: "audio/pcm;rate=16000",
                            data: bufferToBase64(chunk)
                        }
                    }
                }));
                offset += chunkSize;
                
                // 将 100ms 间隔缩短到 10ms，实现 10 倍速极速处理！
                await new Promise(r => setTimeout(r, 10)); 
            }

            // 发送完毕，更新进度条至 100%
            sendSSE('progress', { ratio: 1, currentSec: uint8.length/16000, totalSec: uint8.length/16000 });
            sendSSE('upload_complete', true);

            // 告诉 Google 输入流已结束
            ws.send(JSON.stringify({
                clientContent: { turnComplete: true }
            }));
        })();

    } catch (e) {
        sendSSE('error', e.message);
        writer.close();
    }

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
