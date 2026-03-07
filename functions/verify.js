export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { password, token, fileName } = await request.json();

        // 1. 人机验证
        const formData = new FormData();
        formData.append('secret', env.CF_TURNSTILE_SECRET);
        formData.append('response', token);
        const cfVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            body: formData, method: 'POST',
        });
        const outcome = await cfVerify.json();
        if (!outcome.success) return new Response(JSON.stringify({ error: 'SESSION_EXPIRED' }), { status: 403 });

        // 2. 密码校验
        if (password !== env.EXTRACTION_PWD) {
            return new Response(JSON.stringify({ error: 'INVALID_CREDENTIAL' }), { status: 401 });
        }

        // 3. 返回哈希目录下的真实路径
        // 这种方式利用了目录混淆，外界无法直接扫出文件
        const securePath = `/files_storage_secret_8d2f/${fileName}`;
        
        return new Response(JSON.stringify({ url: securePath }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'INTERNAL_ERROR' }), { status: 500 });
    }
}