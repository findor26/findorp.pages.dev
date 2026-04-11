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
      try {
        const stats = await env.DB.prepare(`
          SELECT 
            (SELECT COUNT(*) FROM messages WHERE parent_id IS NULL) as total,
            (SELECT COUNT(*) FROM messages WHERE parent_id IS NULL AND date(created_at) = date('now')) as today,
            (SELECT COUNT(*) FROM messages WHERE parent_id IS NOT NULL) as total_replies
        `).first();
        return Response.json(stats);
      } catch (statsErr) {
        // 如果parent_id字段不存在，使用旧统计
        if (statsErr.message && statsErr.message.includes("no such column: parent_id")) {
          const stats = await env.DB.prepare(`
            SELECT 
              (SELECT COUNT(*) FROM messages) as total,
              (SELECT COUNT(*) FROM messages WHERE date(created_at) = date('now')) as today,
              0 as total_replies
          `).first();
          return Response.json(stats);
        } else {
          throw statsErr;
        }
      }
    }

    const page = parseInt(url.searchParams.get("page")) || 1;
    const size = parseInt(url.searchParams.get("size")) || 10;
    const offset = (page - 1) * size;
    const parent_id = url.searchParams.get("parent_id");

    // 如果指定了parent_id，获取该留言的回复
    if (parent_id) {
      const query = isAdmin 
        ? "SELECT * FROM messages WHERE parent_id = ? ORDER BY created_at ASC"
        : "SELECT * FROM messages WHERE parent_id = ? AND is_hidden = 0 ORDER BY created_at ASC";
      
      const { results } = await env.DB.prepare(query).bind(parent_id).all();
      return Response.json(results || []);
    }

    // 否则获取主留言列表
    // 先尝试使用parent_id字段查询，如果失败则使用旧查询
    let results;
    try {
      const query = isAdmin 
        ? "SELECT * FROM messages WHERE parent_id IS NULL ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?"
        : "SELECT * FROM messages WHERE parent_id IS NULL AND is_hidden = 0 ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?";

      const queryResult = await env.DB.prepare(query).bind(size, offset).all();
      results = queryResult.results || [];
    } catch (queryErr) {
      // 如果parent_id字段不存在，使用旧查询
      if (queryErr.message && queryErr.message.includes("no such column: parent_id")) {
        const query = isAdmin 
          ? "SELECT * FROM messages ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?"
          : "SELECT * FROM messages WHERE is_hidden = 0 ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?";

        const queryResult = await env.DB.prepare(query).bind(size, offset).all();
        results = queryResult.results || [];
      } else {
        throw queryErr;
      }
    }
    
    // 为每个主留言获取回复数量
    for (const message of results) {
      try {
        // 先检查是否有reply_count字段
        if (message.reply_count === undefined) {
          // 尝试动态计算回复数量
          const replyCountResult = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM messages WHERE parent_id = ? AND (is_hidden = 0 OR ? = 1)"
          ).bind(message.id, isAdmin ? 1 : 0).first();
          message.reply_count = replyCountResult?.count || 0;
        }
      } catch (countErr) {
        // 如果查询失败，设置默认值
        message.reply_count = 0;
      }
    }
    
    return Response.json(results || []);
  }

  // --- 发布留言 (POST) ---
  if (request.method === "POST") {
    try {
      const { nickname, content, parent_id } = await request.json();
      if (!nickname || !content) return new Response("字段缺失", { status: 400 });

      // 检查留言总数限制（500条）- 只有主留言才检查
      if (!parent_id) {
        const totalResult = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM messages WHERE parent_id IS NULL"
        ).first();
        if (totalResult && totalResult.count >= 500) {
          return new Response("留言数量已达上限（500条）", { status: 400 });
        }
      }

      // 如果parent_id存在，验证父留言是否存在且不是回复的回复
      if (parent_id) {
        const parentResult = await env.DB.prepare(
          "SELECT parent_id FROM messages WHERE id = ?"
        ).bind(parent_id).first();
        
        if (!parentResult) {
          return new Response("父留言不存在", { status: 400 });
        }
        if (parentResult.parent_id !== null) {
          return new Response("不能回复回复留言", { status: 400 });
        }
      }

      const ip = request.headers.get("CF-Connecting-IP") || "Unknown";
      const createdAt = new Date().toISOString();

      try {
        // 尝试插入留言（包含parent_id字段）
        await env.DB.prepare(
          "INSERT INTO messages (nickname, content, created_at, ip_address, parent_id) VALUES (?, ?, ?, ?, ?)"
        ).bind(nickname, content, createdAt, ip, parent_id || null).run();
      } catch (dbErr) {
        // 如果parent_id字段不存在，尝试不带parent_id的插入
        if (dbErr.message && dbErr.message.includes("no such column: parent_id")) {
          await env.DB.prepare(
            "INSERT INTO messages (nickname, content, created_at, ip_address) VALUES (?, ?, ?, ?)"
          ).bind(nickname, content, createdAt, ip).run();
        } else {
          throw dbErr;
        }
      }


      // 如果是回复，尝试更新父留言的回复计数
      if (parent_id) {
        try {
          await env.DB.prepare(
            "UPDATE messages SET reply_count = reply_count + 1 WHERE id = ?"
          ).bind(parent_id).run();
        } catch (updateErr) {
          // 如果reply_count字段不存在，忽略这个错误
          if (!updateErr.message || !updateErr.message.includes("no such column: reply_count")) {
            console.error("更新回复计数失败:", updateErr);
          }
        }
      }
      
      return new Response("OK", { status: 201 });
    } catch (err) {
      console.error("发布失败:", err);
      return new Response("发布失败: " + (err.message || "未知错误"), { status: 500 });
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
      // 先检查是否是主留言
      const messageResult = await env.DB.prepare(
        "SELECT parent_id FROM messages WHERE id = ?"
      ).bind(messageId).first();
      
      if (messageResult) {
        if (messageResult.parent_id === null) {
          // 删除主留言及其所有回复
          await env.DB.prepare(
            "DELETE FROM messages WHERE id = ? OR parent_id = ?"
          ).bind(messageId, messageId).run();
        } else {
          // 删除回复留言，并更新父留言的回复计数
          await env.DB.prepare(
            "DELETE FROM messages WHERE id = ?"
          ).bind(messageId).run();
          
          await env.DB.prepare(
            "UPDATE messages SET reply_count = MAX(0, reply_count - 1) WHERE id = ?"
          ).bind(messageResult.parent_id).run();
        }
      }
      
      return new Response("删除成功");
    } catch (err) {
      console.error("删除失败:", err);
      return new Response("删除失败", { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}