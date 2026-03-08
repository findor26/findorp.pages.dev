export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const adminPassword = request.headers.get("Admin-Token");
  const SECRET = env.ADMIN_PASSWORD;
  const isAdmin = adminPassword === SECRET && SECRET !== undefined;

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

  // --- 获取逻辑 (GET) ---
  if (request.method === "GET") {
    // 统计功能：如果带了 ?stats=true 且是管理员，返回数据概览
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

    try {
      // 逻辑：
      // 1. 普通用户：仅看未隐藏的，排序为：置顶优先 > 时间倒序
      // 2. 管理员：可以看到所有（包括隐藏的），排序一致
      const query = isAdmin 
        ? "SELECT * FROM messages ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?"
        : "SELECT * FROM messages WHERE is_hidden = 0 ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?";

      const { results } = await env.DB.prepare(query).bind(size, offset).all();
      return Response.json(results);
    } catch (err) {
      return new Response("数据库查询失败", { status: 500 });
    }
  }

  // --- 提交逻辑 (POST) ---
  if (request.method === "POST") {
    try {
      const { nickname, content } = await request.json();
      
      if (!nickname || nickname.length > 20 || !content || content.length > 500) {
        return new Response("输入长度不合规", { status: 400 });
      }

      // 获取访问者 IP (Cloudflare 特有 Header)
      const ip = request.headers.get("CF-Connecting-IP") || "Unknown";
      const createdAt = new Date().toISOString();

      await env.DB.prepare(
        "INSERT INTO messages (nickname, content, created_at, ip_address, is_pinned, is_hidden) VALUES (?, ?, ?, ?, 0, 0)"
      ).bind(nickname, content, createdAt, ip).run();
      
      return new Response("OK", { status: 201 });
    } catch (err) {
      return new Response("发布失败", { status: 500 });
    }
  }

  // --- 状态更新逻辑 (PATCH) ---
  // --- 修复后的 PATCH 逻辑 ---
  if (request.method === "PATCH") {
    try {
      const { id, action } = await request.json();
      if (!id || !action) return new Response("参数缺失", { status: 400 });

      // 第一类：管理操作（置顶、隐藏）-> 必须校验 Admin-Token
      if (action === "pin" || action === "hide") {
        if (!isAdmin) {
          return new Response("未授权的管理操作", { status: 401 });
        }

        let sql = action === "pin" 
          ? "UPDATE messages SET is_pinned = 1 - is_pinned WHERE id = ?" 
          : "UPDATE messages SET is_hidden = 1 - is_hidden WHERE id = ?";
        
        await env.DB.prepare(sql).bind(id).run();
        return new Response("管理状态已更新");
      }

      // 第二类：公共互动（点赞、踩）-> 所有人可用，无需 401 校验
      if (action === "upvote" || action === "downvote") {
        let sql = action === "upvote"
          ? "UPDATE messages SET upvotes = upvotes + 1 WHERE id = ?"
          : "UPDATE messages SET downvotes = downvotes + 1 WHERE id = ?";
        
        await env.DB.prepare(sql).bind(id).run();
        return new Response("投票成功");
      }

      return new Response("未知操作", { status: 400 });
    } catch (err) {
      return new Response("服务器内部错误", { status: 500 });
    }
  }
  // 用于管理员 置顶 (pin) 或 隐藏 (hide) 留言
  if (request.method === "PATCH") {
    if (!isAdmin) return new Response("未授权", { status: 401 });

    try {
      const { id, action } = await request.json();
      if (!id || !action) return new Response("参数缺失", { status: 400 });

      let sql = "";
      if (action === "pin") {
        // 切换置顶状态 (0变1, 1变0)
        sql = "UPDATE messages SET is_pinned = 1 - is_pinned WHERE id = ?";
      } else if (action === "hide") {
        // 切换隐藏状态
        sql = "UPDATE messages SET is_hidden = 1 - is_hidden WHERE id = ?";
      } else {
        return new Response("非法操作", { status: 400 });
      }

      await env.DB.prepare(sql).bind(id).run();
      return new Response("更新成功");
    } catch (err) {
      return new Response("服务器错误", { status: 500 });
    }
  }

  // --- 删除逻辑 (DELETE) ---
  if (request.method === "DELETE") {
    if (!isAdmin) return new Response("未授权", { status: 401 });

    const messageId = url.searchParams.get("id");
    if (!messageId) return new Response("ID 缺失", { status: 400 });

    try {
      await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId).run();
      return new Response("已删除", { status: 200 });
    } catch (err) {
      return new Response("删除失败", { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}