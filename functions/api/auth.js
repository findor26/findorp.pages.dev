export async function onRequest(context) {
    const { env } = context;
    const ABLY_KEY = env.ABLY_API_KEY; 

    if (!ABLY_KEY || !ABLY_KEY.includes(':')) {
        return new Response(JSON.stringify({ error: "Key配置错误" }), { status: 500 });
    }

    const [keyId, keySecret] = ABLY_KEY.split(':');
    const clientId = `user_${Math.random().toString(36).substring(7)}`;

    try {
        // 请求 Ably 的 REST API 来托管生成 TokenRequest
        const response = await fetch(`https://rest.ably.io/keys/${keyId}/requestToken`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 使用 Basic Auth 认证，这比手动算 MAC 稳定得多
                'Authorization': 'Basic ' + btoa(ABLY_KEY)
            },
            body: JSON.stringify({
                clientId: clientId,
                // 包含游戏所需的完整权限
                capability: { "game-*": ["publish", "subscribe", "presence", "history"] },
                ttl: 3600000 
            })
        });

        if (!response.ok) {
            const errorDetail = await response.json();
            return new Response(JSON.stringify({ error: "Ably拒绝请求", detail: errorDetail }), { status: 401 });
        }

        const tokenRequest = await response.json();

        // 直接透传给前端 SDK
        return new Response(JSON.stringify(tokenRequest), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: "网络异常", message: err.message }), { status: 500 });
    }
}