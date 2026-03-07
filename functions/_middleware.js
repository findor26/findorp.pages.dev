export async function onRequest(context) {
    const { request, env, next } = context;
    const clientIP = request.headers.get("cf-connecting-ip");

    try {
        // 检查 KV 中是否存在该 IP 的封禁记录
        const blockReason = await env.BLACKLIST_KV.get(clientIP);
        
        if (blockReason) {
            // 如果被封禁，直接返回 403 状态码
            // 并在响应头中加入自定义字段，方便前端识别
            return new Response(JSON.stringify({ 
                error: "IP_BLOCKED", 
                reason: blockReason 
            }), { 
                status: 403,
                headers: { 
                    "Content-Type": "application/json; charset=utf-8",
                    "X-Block-Status": "active" 
                }
            });
        }
    } catch (e) {
        // 如果 KV 还没配置好，打印错误但放行，防止全站崩溃
        console.error("KV 访问失败:", e);
    }

    return next();

    // 1. 尝试从 KV 中读取该 IP 的封禁状态
    // 如果 KV 还没绑定好，这里会抛错，所以加个 try-catch
    try {
        const blockReason = await env.BLACKLIST_KV.get(clientIP);
        if (blockReason) {
            return new Response(`访问被拒绝。原因：${blockReason}`, { 
                status: 403,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    } catch (e) {
        console.error("KV 尚未绑定或配置错误");
    }

    // 2. 特征检测：自动封禁常见爬虫 UA
    const userAgent = request.headers.get('user-agent') || '';
    const isBot = /HTTrack|python-requests|Go-http-client|Java|Wget/i.test(userAgent);
    
    if (isBot) {
        await env.BLACKLIST_KV.put(clientIP, `检测到非法爬虫工具: ${userAgent}`, { expirationTtl: 86400 }); // 封禁24小时
        return new Response("检测到自动化工具，IP 已封禁。", { status: 403 });
    }

    return next();
}