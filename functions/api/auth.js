export async function onRequest(context) {
    const { env } = context;
    return new Response(env.ABLY_API_KEY, {
        headers: { 'Content-Type': 'text/plain' }
    });
}