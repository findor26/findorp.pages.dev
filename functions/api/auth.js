export async function onRequest(context) {
    const { env } = context;
    const ABLY_KEY = env.ABLY_API_KEY; 

    if (!ABLY_KEY || !ABLY_KEY.includes(':')) {
        return new Response(JSON.stringify({ error: "环境变量 ABLY_API_KEY 配置错误" }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const [keyId, keySecret] = ABLY_KEY.split(':');
    const clientId = "user_" + Math.random().toString(36).substring(7);

    try {
        // 请求 Ably 生成 TokenRequest
        const response = await fetch(`https://rest.ably.io/keys/${keyId}/requestToken`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(ABLY_KEY)
            },
            body: JSON.stringify({
                clientId: clientId,
                // 移除手动 timestamp，交给 Ably 服务端处理
                capability: { "game-*": ["subscribe", "publish", "presence"] },
                ttl: 3600000 
            })
        });

        if (!response.ok) {
            const errorInfo = await response.json();
            return new Response(JSON.stringify({ error: "Ably 拒绝了请求", detail: errorInfo }), { 
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const tokenRequest = await response.json();
        
        return new Response(JSON.stringify(tokenRequest), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' 
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: "服务器内部错误", message: err.message }), { status: 500 });
    }
}