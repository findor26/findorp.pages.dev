export async function onRequest(context) {
    const { request, next } = context;

    // 从 Cloudflare 特有的 Header 中获取客户端真实 IP
    const clientIp = request.headers.get("CF-Connecting-IP");

    // 待拉黑的 IP 列表
    const blacklistedIps = [
        "183.95.42.127",
        "5.6.7.8"
    ];
    if (blacklistedIps.includes(clientIp)) {
        // 立即返回 403 拒绝访问，不再执行后续逻辑
        return new Response("您的 IP 已被禁止访问", {
            status: 403,
            statusText: "Forbidden",
            headers: {
                "Content-Type": "text/plain; charset=utf-8"
            }
        });
    }

    // 如果 IP 不在黑名单中，则继续处理请求
    return await next();
}