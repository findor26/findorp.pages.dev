// functions/api/translate-audio.js

export async function onRequest(context) {
    const { request, env } = context;

    const urlObj = new URL(request.url);
    const fileId = urlObj.searchParams.get('id'); // 获取 Bin 空间 ID

    if (!fileId) {
        return new Response('Missing task ID', { status: 400 });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response('Missing GEMINI_API_KEY env', { status: 500 });
    }

    // 从 filebin.net 极速直连通道获取暂存数据
    const fileUrl = `https://filebin.net/${fileId}/audio.bin`;
    const fileResponse = await fetch(fileUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    
    if (!fileResponse.ok) {
        const errText = await fileResponse.text().catch(() => '');
        return new Response(`无法从临时存储下载文件 (${fileResponse.status}): ${errText}`, { status: 444 });
    }

    const pcmBuffer = await fileResponse.arrayBuffer();

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    function sendSSE(event, data) {
        writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }

    // 核心修复点 1：切换为和你本地运行成功的 SDK 完全一致的 v1alpha 原生端点
    const targetUrl = `https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

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
                            if (part.inlineData && part.inlineData.data) {
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

        // 核心修复点 2：在 v1alpha 端点下，数据结构完全和你本地工作的结构同步：
        // 1. 将 outputAudioTranscription 重新嵌套进 generationConfig 内
        // 2. 移除最外层的 inputAudioTranscription
        // 3. targetLanguageCode 使用标准的 "zh-Hans"（中文简体）
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

        (async () => {
            // 物理等待 500ms 让 Google 彻底就绪
            await new Promise(r => setTimeout(r, 500));
            sendSSE('transcription', '[系统]: 通道初始化完毕，正在以 2 倍速流式传输并翻译音频...');

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
                
                // 50ms 稳定推流时速
                await new Promise(r => setTimeout(r, 50)); 
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
