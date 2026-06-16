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

        // 核心修复点 1：构建标准的 FormData。通过 Blob 对象包装，Cloudflare 会精确计算并发送 Content-Length，
        // 彻底解决 Filebin 因不支持 Chunked 分块传输而导致默默保存为 0 字节空文件的问题！
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        
        const fileBlob = new Blob([pcmBuffer], { type: 'application/octet-stream' });
        formData.append('fileToUpload', fileBlob, 'audio.bin');

        // 投递给拥有 10 年历史、极高带宽、完全不封锁 Cloudflare 节点的匿名存储站 Catbox
        const catboxResponse = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData
        });

        if (!catboxResponse.ok) {
            const errText = await catboxResponse.text();
            throw new Error(`存储端上传失败 (${catboxResponse.status}): ${errText}`);
        }

        const fileUrl = (await catboxResponse.text()).trim(); // 返回例如 "https://files.catbox.moe/xxxxxx.bin"
        const fileId = fileUrl.split('/').pop(); // 提取 "xxxxxx.bin" 作为 taskId 传回给前端

        if (!fileId) {
            throw new Error('未获取到有效的文件 ID');
        }

        return new Response(JSON.stringify({ taskId: fileId }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
