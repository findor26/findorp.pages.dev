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

    // 生成 TokenRequest 的参数
    const clientId = "user_" + Math.random().toString(36).substring(7);

    try {
        // 直接向 Ably 请求 TokenRequest 对象
        // 注意：Ably 官方推荐在 Server 端直接返回生成的 TokenRequest 给 SDK
        const response = await fetch(`https://rest.ably.io/keys/${keyId}/requestToken`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 使用 Basic Auth 认证
                'Authorization': 'Basic ' + btoa(ABLY_KEY)
            },
            body: JSON.stringify({
                clientId: clientId,
                capability: { "game-*": ["subscribe", "publish", "presence"] },
                ttl: 3600000 // 有效期 1 小时
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(JSON.stringify({ error: "Ably 请求失败", detail: errorText }), { status: 500 });
        }

        const tokenRequest = await response.json();
        
        // 关键：必须直接返回这个 JSON 对象，不要包裹在其他 Key 下
        return new Response(JSON.stringify(tokenRequest), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // 防止跨域问题
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}