export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // --- 获取逻辑 (GET) ---
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM messages ORDER BY created_at DESC LIMIT 100"
    ).all();
    return Response.json(results);
  }

  // --- 提交逻辑 (POST) ---
  if (request.method === "POST") {
    const { nickname, content } = await request.json();
    if (!nickname || !content) return new Response("内容缺失", { status: 400 });

    await env.comments.prepare(
      "INSERT INTO messages (nickname, content) VALUES (?, ?)"
    ).bind(nickname, content).run();
    return new Response("OK", { status: 201 });
  }

  // --- 删除逻辑 (DELETE) ---
  if (request.method === "DELETE") {
    const adminPassword = request.headers.get("Admin-Token");
    const SECRET = env.ADMIN_PASSWORD || "mypassword"; 

    if (adminPassword !== SECRET) {
      return new Response("未授权", { status: 401 });
    }

    const messageId = url.searchParams.get("id");
    if (!messageId) return new Response("缺少 ID", { status: 400 });

    await env.DB.prepare(
      "DELETE FROM messages WHERE id = ?"
    ).bind(messageId).run();

    return new Response("已删除", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
}