export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // 提取管理员令牌
  const adminToken = request.headers.get("Admin-Token");
  const SECRET = env.ADMIN_PASSWORD;
  // 校验管理员身份
  const isAdmin = adminToken === SECRET && SECRET !== undefined;

  // 处理预检请求 (CORS)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Admin-Token",
      },
    });
  }

  // --- 获取数据 (GET) ---
  if (request.method === "GET") {
    // 管理员获取统计数据
    if (url.searchParams.get("stats") === "true" && isAdmin) {
      const stats = await env.DB.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM messages) as total,
          (SELECT COUNT(*) FROM messages WHERE date(created_at) = date('now')) as today
      `).first();
      return Response.json(stats);
    }

    const page = parseInt(url.searchParams.get("page")) || 1;
    const size = parseInt(url.searchParams.get("size")) || 10;
    const offset = (page - 1) * size;

    // 管理员可看到隐藏内容，普通用户只能看公开内容
    const query = isAdmin 
      ? "SELECT * FROM messages ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?"
      : "SELECT * FROM messages WHERE is_hidden = 0 ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?";

    const { results } = await env.DB.prepare(query).bind(size, offset).all();
    return Response.json(results);
  }

  // --- 发布留言 (POST) ---
  if (request.method === "POST") {
    try {
      const { nickname, content } = await request.json();
      if (!nickname || !content) return new Response("字段缺失", { status: 400 });

      const ip = request.headers.get("CF-Connecting-IP") || "Unknown";
      const createdAt = new Date().toISOString();

      await env.DB.prepare(
        "INSERT INTO messages (nickname, content, created_at, ip_address) VALUES (?, ?, ?, ?)"
      ).bind(nickname, content, createdAt, ip).run();
      
      return new Response("OK", { status: 201 });
    } catch (err) {
      return new Response("发布失败", { status: 500 });
    }
  }

  // --- 更新状态 (PATCH) - 核心修复区域 ---
  if (request.method === "PATCH") {
    try {
      const { id, action } = await request.json();
      if (!id || !action) return new Response("参数缺失", { status: 400 });

      // 1. 权限分流：管理类动作
      if (action === "pin" || action === "hide") {
        if (!isAdmin) {
          // 401 触发原因：action 是管理动作但 isAdmin 为 false
          return new Response("管理员权限验证失败", { status: 401 });
        }

        const sql = action === "pin" 
          ? "UPDATE messages SET is_pinned = 1 - is_pinned WHERE id = ?" 
          : "UPDATE messages SET is_hidden = 1 - is_hidden WHERE id = ?";
        
        await env.DB.prepare(sql).bind(id).run();
        return new Response("管理操作成功");
      }

      // 2. 权限分流：公共互动动作 (无需 isAdmin 校验)
      let voteSql = "";
      switch (action) {
        case "upvote": voteSql = "UPDATE messages SET upvotes = upvotes + 1 WHERE id = ?"; break;
        case "downvote": voteSql = "UPDATE messages SET downvotes = downvotes + 1 WHERE id = ?"; break;
        case "un_upvote": voteSql = "UPDATE messages SET upvotes = MAX(0, upvotes - 1) WHERE id = ?"; break;
        case "un_downvote": voteSql = "UPDATE messages SET downvotes = MAX(0, downvotes - 1) WHERE id = ?"; break;
      }

      if (voteSql) {
        await env.DB.prepare(voteSql).bind(id).run();
        return new Response("互动成功");
      }

      return new Response("无效的 Action", { status: 400 });
    } catch (err) {
      return new Response("服务器错误", { status: 500 });
    }
  }

  // --- 删除留言 (DELETE) ---
  if (request.method === "DELETE") {
    if (!isAdmin) return new Response("未授权", { status: 401 });

    const messageId = url.searchParams.get("id");
    try {
      await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId).run();
      return new Response("删除成功");
    } catch (err) {
      return new Response("删除失败", { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}