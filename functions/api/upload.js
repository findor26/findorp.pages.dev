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

        // 包装为标准的 multipart/form-data（表单表头）格式
        const formData = new FormData();
        const fileBlob = new Blob([pcmBuffer], { type: 'application/octet-stream' });
        
        // 注意：根据 Pixeldrain API 规范，上传文件的表单字段名必须是 'file'
        formData.append('file', fileBlob, 'audio.bin'); 

        // 改用稳定的匿名 POST 上传点
        const pixeldrainResponse = await fetch('https://pixeldrain.com/api/file', {
            method: 'POST',
            body: formData
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
