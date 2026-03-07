/**
 * 核心后端验证与文件转发逻辑
 * 部署位置：Cloudflare Pages 项目根目录下的 /functions/verify.js
 */

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1. 解析前端发送的 JSON 数据
        const { password, token, fileName } = await request.json();

        // 2. 第一道防线：校验 Cloudflare Turnstile 人机验证码
        // 确保请求不是来自自动化脚本
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

        // 3. 第二道防线：校验提取密码 (从 Secrets 中读取 EXTRACTION_PWD)
        // 建议密码：qruptanki26
        if (password !== env.EXTRACTION_PWD) {
            return new Response(JSON.stringify({ error: '提取密码不正确' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 4. 第三道防线：通过 GitHub API 访问私有哈希仓库
        // 使用环境变量中的 GH_REPO (如 findor26/2ccb8b6929) 和 GH_TOKEN
        const githubApiUrl = `https://api.github.com/repos/${env.GH_REPO}/contents/${encodeURIComponent(fileName)}`;

        const ghResponse = await fetch(githubApiUrl, {
            headers: {
                'Authorization': `Bearer ${env.GH_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw', // 关键：要求返回文件原始二进制流
                'User-Agent': 'Cloudflare-Worker-Findor-Service'
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

        // 5. 成功：将文件流透传给前端
        // 重新构建 Headers 确保浏览器识别为下载
        const responseHeaders = new Headers(ghResponse.headers);
        responseHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        responseHeaders.set('Access-Control-Allow-Origin', '*'); 
        // 移除可能导致冲突的 GitHub 特定头
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