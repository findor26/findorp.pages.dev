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
        
        // 按照 Uguu 的标准表单参数上传 (注意字段名必须是 'files[]')
        formData.append('files[]', fileBlob, 'audio.bin'); 

        // 投递到纯外部、不走 Cloudflare WAF 阻断的知名临时存储站 uguu.se（免配置且非常稳定）
        const response = await fetch('https://uguu.se/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`存储端上传失败 (${response.status}): ${errText}`);
        }

        const resData = await response.json(); 
        // 返回格式为 {"success":true,"files":[{"name":"audio.bin","url":"https://a.uguu.se/xxxx.bin","size":1234}]}

        if (!resData.success || !resData.files || resData.files.length === 0) {
            throw new Error('存储端未返回有效的文件信息');
        }

        const fileUrl = resData.files[0].url; // 形如 "https://a.uguu.se/xxxx.bin"
        
        // 提取域名后面的文件名作为任务 ID（例如 "xxxx.bin"）
        const pathId = fileUrl.replace('https://a.uguu.se/', '');

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
