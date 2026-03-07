export async function onRequest(context) {
    const { request, env } = context;
    const clientIP = request.headers.get("cf-connecting-ip");

    // 一旦访问此路径，写入 KV 永久封禁
    try {
        await env.BLACKLIST_KV.put(clientIP, "恶意扫描敏感目录 (Trap Triggered)");
    } catch (e) {
        return new Response("KV Binding Missing", { status: 500 });
    }

    return new Response("系统已锁定。你的 IP 记录已上报。", { 
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}