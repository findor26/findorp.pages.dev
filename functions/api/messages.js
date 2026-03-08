export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 处理预检请求 (CORS)，允许自定义 Header 通过
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Admin-Token",
      },
    });
  }

  // --- 获取逻辑 (GET) ---
  if (request.method === "GET") {
    const page = parseInt(url.searchParams.get("page")) || 1;
    const size = parseInt(url.searchParams.get("size")) || 10;
    const offset = (page - 1) * size;

    try {
      // 分页查询：根据偏移量获取指定数量的数据
      const { results } = await env.DB.prepare(
        "SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).bind(size, offset).all();
      
      return Response.json(results);
    } catch (err) {
      return new Response("数据库读取失败", { status: 500 });
    }
  }

  // --- 提交逻辑 (POST) ---
  if (request.method === "POST") {
    try {
      const { nickname, content } = await request.json();
      
      // 后端二次校验长度，确保数据规范
      if (!nickname || nickname.length > 20 || !content || content.length > 500) {
        return new Response("称呼或内容不符合长度要求", { status: 400 });
      }

      const createdAt = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO messages (nickname, content, created_at) VALUES (?, ?, ?)"
      ).bind(nickname, content, createdAt).run();
      
      return new Response("发布成功", { status: 201 });
    } catch (err) {
      return new Response("提交失败", { status: 500 });
    }
  }

  // --- 删除逻辑 (DELETE) ---
  if (request.method === "DELETE") {
    const adminPassword = request.headers.get("Admin-Token");
    const secret = env.ADMIN_PASSWORD; 

    // 检查环境变量是否配置
    if (!secret) {
      return new Response("服务器配置错误：未设置管理密钥", { status: 500 });
    }

    // 令牌严格校验
    if (!adminPassword || adminPassword !== secret) {
      return new Response("身份验证失败", { status: 401 });
    }

    const messageId = url.searchParams.get("id");
    if (!messageId) {
      return new Response("未指定删除目标", { status: 400 });
    }

    try {
      await env.DB.prepare(
        "DELETE FROM messages WHERE id = ?"
      ).bind(messageId).run();
      
      return new Response("删除成功", { status: 200 });
    } catch (err) {
      return new Response("删除失败", { status: 500 });
    }
  }

  return new Response("不支持的请求方式", { status: 405 });
}