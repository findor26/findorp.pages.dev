export async function onRequestPost(context) {
    const { request, env } = context;
    const { password, token, fileName } = await request.json();

    /* 1. 验证 Turnstile 人机验证码 */
    const formData = new FormData();
    formData.append('secret', env.CF_TURNSTILE_SECRET);
    formData.append('response', token);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        body: formData,
        method: 'POST',
    });
    const outcome = await result.json();

    if (!outcome.success) {
        return new Response(JSON.stringify({ error: '安全验证未通过' }), { status: 403 });
    }

    /* 2. 验证提取密码 */
    if (password !== env.EXTRACTION_PWD) {
        return new Response(JSON.stringify({ error: '密码错误' }), { status: 401 });
    }

    /* 3. 验证通过，返回混淆后的下载路径 */
    const secretPath = '_storage_secret_8d2f/'; 
    return new Response(JSON.stringify({ url: secretPath + fileName }));
}