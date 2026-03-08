export async function onRequest(context) {
    const { env } = context;
    const ABLY_KEY = env.ABLY_API_KEY; 

    if (!ABLY_KEY || !ABLY_KEY.includes(':')) {
        return new Response(JSON.stringify({ error: "环境变量配置错误" }), { status: 500 });
    }

    const [keyId, keySecret] = ABLY_KEY.split(':');
    // 使用固定的前缀加随机字符，确保符合 clientId 字符串规范
    const clientId = `user_${Math.random().toString(36).substring(7)}`;

    try {
        // 使用简单的 POST 请求，仅包含必须的最小化字段
        const response = await fetch(`https://rest.ably.io/keys/${keyId}/requestToken`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(ABLY_KEY)
            },
            body: JSON.stringify({
                clientId: clientId,
                // 不要在这里写 timestamp，Ably 会自动补全
                capability: { "game-*": ["subscribe", "publish", "presence"] }
            })
        });

        const result = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ 
                error: "Ably 鉴权失败", 
                detail: result 
            }), { 
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 直接返回完整的 TokenRequest 对象给前端 SDK
        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: "系统异常", message: err.message }), { status: 500 });
    }
}