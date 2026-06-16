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

    const pcmBuffer = await request.arrayBuffer();

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    function sendSSE(event, data) {
        writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }

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
                // 忽略
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

        (async () => {
            const uint8 = new Uint8Array(pcmBuffer);
            // 修复点 1：16kHz 16-bit Mono 音频，100ms 对应的字节数应为 3200 字节 (1600采样点 * 2字节)
            const chunkSize = 3200; 
            let offset = 0;

            function bufferToBase64(buf) {
                let binary = '';
                for (let i = 0; i < buf.length; i++) {
                    binary += String.fromCharCode(buf[i]);
                }
                return btoa(binary);
            }

            while (offset < uint8.length) {
                // 修复点 2：1秒 = 32000 字节。换算时间必须除以 32000 才能得出正确秒数
                sendSSE('progress', {
                    ratio: offset / uint8.length,
                    currentSec: offset / 32000,
                    totalSec: uint8.length / 32000
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
                
                // 修复点 3：将延迟设为安全的 30ms (约 3.3 倍速翻译)。这处于 Google 的安全频控线以内，非常稳定
                await new Promise(r => setTimeout(r, 30)); 
            }

            sendSSE('progress', { ratio: 1, currentSec: uint8.length/32000, totalSec: uint8.length/32000 });
            sendSSE('upload_complete', true);

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
