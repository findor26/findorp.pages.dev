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

        // 包装为标准的 multipart/form-data 格式
        const formData = new FormData();
        const fileBlob = new Blob([pcmBuffer], { type: 'application/octet-stream' });
        
        // 0x0.st 要求的上传字段名必须是 'file'
        formData.append('file', fileBlob, 'audio.bin'); 

        // 上传到老牌、完全免费的匿名存储站 0x0.st
        const response = await fetch('https://0x0.st', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`存储端上传失败 (${response.status}): ${errText}`);
        }

        const fileUrl = (await response.text()).trim(); // 返回格式为 "https://0x0.st/xxxx.bin"
        
        // 提取文件名（如 "xxxx.bin"）作为任务 ID 传给前端
        const fileId = fileUrl.split('/').pop(); 

        if (!fileId) {
            throw new Error('未能从小端获取到有效的文件 ID');
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
