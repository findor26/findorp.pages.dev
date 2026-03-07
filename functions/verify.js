export async function onRequestPost(context) {
    const { request, env } = context;
    const { password, token, fileName } = await request.json();

    // 1. 验证 Turnstile 
    const formData = new FormData();
    formData.append('secret', env.CF_TURNSTILE_SECRET);
    formData.append('response', token);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        body: formData,
        method: 'POST',
    });
    const outcome = await result.json();

    if (!outcome.success) {
        return new Response(JSON.stringify({ error: '安全验证未通过，请刷新重试' }), { status: 403 });
    }

    // 2. 验证提取密码 (对比 Secrets 里的变量)
    if (password !== env.EXTRACTION_PWD) {
        return new Response(JSON.stringify({ error: '提取密码错误' }), { status: 401 });
    }

    // 3. 验证通过，返回物理路径
    // 这里的路径也是从后端拼接，前端源码里连文件夹名字都找不到
    const secretPath = '_storage_secret_8d2f/'; 
    return new Response(JSON.stringify({ url: secretPath + fileName }));
}