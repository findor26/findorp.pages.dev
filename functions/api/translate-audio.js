// functions/api/translate-audio.js

export async function onRequest(context) {
    const { request, env } = context;

    const urlObj = new URL(request.url);
    const fileId = urlObj.searchParams.get('id'); // 获取诸如 "public/2026-06-16/uuid/audio.bin" 的任务 ID

    if (!fileId) {
        return new Response('Missing task ID', { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response('Missing GEMINI_API_KEY env', { status: 500 });
    }

    // 从 tfLink 的 Cloudflare 局域网高速通道瞬间获取暂存数据
    const fileUrl = `https://d.tmpfile.link/${fileId}`;
    const fileResponse = await fetch(fileUrl);
    
    if (!fileResponse.ok) {
        return new Response('Task file not found', { status: 444 });
    }

    const pcmBuffer = await fileResponse.arrayBuffer();

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
            const chunkSize = 3200; // 100ms
            let offset = 0;

            function bufferToBase64(buf) {
                let binary = '';
                for (let i = 0; i < buf.length; i++) {
                    binary += String.fromCharCode(buf[i]);
                }
                return btoa(binary);
            }

            while (offset < uint8.length) {
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
                
                // 100ms 原始真实时速
                await new Promise(r => setTimeout(r, 100)); 
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
