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

        // 将文件打包为 Multipart/Form-Data 格式，转存到稳定的免注册存储站 Catbox
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        
        const fileBlob = new Blob([pcmBuffer], { type: 'application/octet-stream' });
        formData.append('fileToUpload', fileBlob, 'audio.bin');

        const catboxResponse = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData
        });

        if (!catboxResponse.ok) {
            throw new Error(`存储端上传失败: ${catboxResponse.status}`);
        }

        const fileUrl = await catboxResponse.text(); // 获取形如 https://files.catbox.moe/xxxxxx.bin 的链接
        
        // 提取中间唯一的 6 位编码作为任务 ID
        const fileId = fileUrl.split('/').pop().split('.')[0]; 

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
