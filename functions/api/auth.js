export async function onRequest(context) {
    const { env } = context;
    const ABLY_KEY = env.ABLY_API_KEY; 
    
    if (!ABLY_KEY) return new Response("Missing Key", { status: 500 });

    const [keyId, keySecret] = ABLY_KEY.split(':');
    const clientId = "player-" + Math.random().toString(36).substring(7);

    // 直接通过 URL 参数请求，不发 Body，彻底避开 JSON 序列化导致的类型问题
    const authHeader = btoa(ABLY_KEY);
    const url = `https://rest.ably.io/keys/${keyId}/requestToken?clientId=${clientId}`;

    try {
        const response = await fetch(url, {
            method: 'POST', // 虽然参数在 URL 里，但 Ably 要求用 POST
            headers: {
                'Authorization': 'Basic ' + authHeader,
                'Content-Type': 'application/json'
            }
        });

        const tokenRequest = await response.json();

        // 这里的 JSON 已经是 Ably 官方生成的标准格式了
        return new Response(JSON.stringify(tokenRequest), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(err.message, { status: 500 });
    }
}