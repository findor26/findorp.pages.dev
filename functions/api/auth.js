export async function onRequest(context) {
    const { env } = context;
    
    // 从环境变量中读取你刚刚设置的 Key
    const ABLY_KEY = env.ABLY_API_KEY; 
    if (!ABLY_KEY) {
        return new Response("未配置 ABLY_API_KEY", { status: 500 });
    }

    const [keyId, keySecret] = ABLY_KEY.split(':');

    // 生成一个随机的玩家 ID
    const clientId = "user_" + Math.random().toString(36).substring(7);

    try {
        // 请求 Ably 颁发 Token
        const response = await fetch(`https://rest.ably.io/keys/${keyId}/requestToken`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(ABLY_KEY)
            },
            body: JSON.stringify({
                clientId: clientId,
                // 限制权限：仅允许订阅和发布以 game- 开头的频道
                capability: { "game-*": ["subscribe", "publish", "presence"] } 
            })
        });

        const tokenRequest = await response.json();
        return new Response(JSON.stringify(tokenRequest), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response("认证失败", { status: 500 });
    }
}