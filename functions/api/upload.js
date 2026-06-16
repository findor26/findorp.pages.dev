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

        // 产生一个高密度的 16 位 16 进制字符串作为专属 Bin 空间 ID
        const binId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // 发送给 Hetzner 物理独立服务器上运行的知名存储站 filebin.net
        // 它的独占带宽和无门槛 PUT 二进制极速上传在同类中最为稳定
        const filebinResponse = await fetch(`https://filebin.net/${binId}/audio.bin`, {
            method: 'PUT',
            body: pcmBuffer,
            headers: {
                'Content-Type': 'application/octet-stream'
            }
        });

        if (!filebinResponse.ok) {
            const errText = await filebinResponse.text();
            throw new Error(`中转存储端上传失败 (${filebinResponse.status}): ${errText}`);
        }

        // 上传成功后，将 binId 作为任务 ID 传回给前端
        return new Response(JSON.stringify({ taskId: binId }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
