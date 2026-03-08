export async function onRequest(context) {
    const { env } = context;
    const ABLY_KEY = env.ABLY_API_KEY; 

    if (!ABLY_KEY || !ABLY_KEY.includes(':')) {
        return new Response(JSON.stringify({ error: "Key 格式不正确" }), { status: 500 });
    }

    const [keyId, keySecret] = ABLY_KEY.split(':');

    try {
        // 关键：只传 clientId 和 capability，坚决不传任何时间戳
        const response = await fetch(`https://rest.ably.io/keys/${keyId}/requestToken`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(ABLY_KEY),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientId: "player-" + Math.random().toString(36).substring(7),
                capability: { "game-*": ["*"] }
                // 绝对不要在这里写 timestamp 或 nonce
            })
        });

        const result = await response.json();

        if (!response.ok) {
            // 如果 Ably 报错，直接返回原始错误
            return new Response(JSON.stringify({ error: result.error }), { 
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 成功时直接返回 Ably 颁发的原生 TokenRequest 对象
        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: { message: err.message } }), { status: 500 });
    }
}