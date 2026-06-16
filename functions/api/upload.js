// functions/api/upload.js

export async function onRequest(context) {
    const { request } = context;

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

    try {
        const pcmBuffer = await request.arrayBuffer();

        // 使用 Pixeldrain 极其稳定的纯二进制 PUT 接口进行中转投递
        const pixeldrainResponse = await fetch('https://pixeldrain.com/api/file/audio.bin', {
            method: 'PUT',
            body: pcmBuffer
        });

        if (!pixeldrainResponse.ok) {
            const errText = await pixeldrainResponse.text();
            throw new Error(`存储端上传失败 (${pixeldrainResponse.status}): ${errText}`);
        }

        const resData = await pixeldrainResponse.json(); // 返回格式为 {"success":true,"id":"xxxxxx"}

        if (!resData.success || !resData.id) {
            throw new Error('存储端未返回有效的任务 ID');
        }

        return new Response(JSON.stringify({ taskId: resData.id }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
