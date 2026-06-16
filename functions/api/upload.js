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
        
        // 按照 tfLink 的标准表单参数上传
        formData.append('file', fileBlob, 'audio.bin'); 

        // 投递给同样位于 Cloudflare 局域网的高速中转站 tfLink
        const response = await fetch('https://tmpfile.link/api/upload', {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`存储端上传失败 (${response.status}): ${errText}`);
        }

        const resData = await response.json(); 
        // 期望的返回格式为 {"downloadLink":"https://d.tmpfile.link/public/YYYY-MM-DD/UUID/audio.bin", ...}

        if (!resData.downloadLink) {
            throw new Error('存储端未返回有效的下载链接');
        }

        // 提取域名后面的路径部分作为轻量任务 ID 传给前端（例如 "public/2026-06-16/uuid/audio.bin"）
        const pathId = resData.downloadLink.replace('https://d.tmpfile.link/', '');

        return new Response(JSON.stringify({ taskId: pathId }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
