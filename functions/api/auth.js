export async function onRequest(context) {
    const { env } = context;
    const ABLY_KEY = env.ABLY_API_KEY; 

    if (!ABLY_KEY || !ABLY_KEY.includes(':')) {
        return new Response(JSON.stringify({ error: "Key配置错误" }), { status: 500 });
    }

    const [keyId, keySecret] = ABLY_KEY.split(':');
    const clientId = `user_${Math.random().toString(36).substring(7)}`;
    const nonce = Math.random().toString(36).substring(2, 12);
    const timestamp = Date.now(); // 毫秒数字

    const capability = JSON.stringify({ "game-*": ["publish", "subscribe", "presence", "history"] });
    const ttl = "3600000";
    const signText = `${keyId}\n${ttl}\n${capability}\n${clientId}\n${timestamp}\n${nonce}\n`;

    try {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(keySecret);
        const msgData = encoder.encode(signText);

        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
        const mac = btoa(String.fromCharCode(...new Uint8Array(signature)));

        return new Response(JSON.stringify({
            keyName: keyId,
            clientId: clientId,
            capability: capability,
            timestamp: Number(timestamp), // 强制转换为数字
            nonce: nonce,
            mac: mac
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}