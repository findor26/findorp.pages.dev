export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { password, token, fileName } = await request.json();
        const formData = new FormData();
        formData.append('secret', env.CF_TURNSTILE_SECRET);
        formData.append('response', token);

        const cfVerifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            body: formData,
            method: 'POST',
        });
        const cfOutcome = await cfVerifyResponse.json();

        if (!cfOutcome.success) {
            return new Response(JSON.stringify({ error: '人机验证未通过，请刷新重试' }), { 
                status: 403, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        if (password !== env.EXTRACTION_PWD) {
            return new Response(JSON.stringify({ error: '提取密码不正确' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        const githubApiUrl = `https://api.github.com/repos/${env.GH_REPO}/contents/${encodeURIComponent(fileName)}`;

        const ghResponse = await fetch(githubApiUrl, {
            headers: {
                'Authorization': `Bearer ${env.GH_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw',
                'User-Agent': 'findorp'
            }
        });

        if (!ghResponse.ok) {
            const errorText = await ghResponse.text();
            console.error('GitHub API Error:', errorText);
            return new Response(JSON.stringify({ error: '私有仓库资源获取失败或文件不存在' }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        const responseHeaders = new Headers(ghResponse.headers);
        responseHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        responseHeaders.set('Access-Control-Allow-Origin', '*'); 
        responseHeaders.delete('x-github-request-id');

        return new Response(ghResponse.body, {
            status: 200,
            headers: responseHeaders
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: '服务器内部错误: ' + err.message }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}