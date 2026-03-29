// /functions/api/[[path]].js

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  
  // 1. 构造指向 Worker 的目标 URL
  // 比如访问 findorp.pages.dev/api/inject -> fdp.findor.workers.dev/inject
  const workerHost = "fdp.findor.workers.dev";
  const targetPath = url.pathname.replace(/^\/api/, ""); // 移除 /api 前缀
  const targetUrl = `https://${workerHost}${targetPath}${url.search}`;

  // 2. 复制原始请求的 Header，但要修改 Host
  const newHeaders = new Headers(request.headers);
  newHeaders.set("Host", workerHost);
  newHeaders.set("X-Forwarded-Host", url.host);

  // 3. 发起背靠背请求
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: "manual" // 重要：处理重定向由 Pages 控制
    });

    // 4. 处理重定向 (针对你的 /random 路由)
    if ([301, 302].includes(response.status)) {
      const location = response.headers.get("Location");
      return Response.redirect(location, response.status);
    }

    // 5. 返回结果给用户
    return response;
  } catch (e) {
    return new Response(`[代理异常]: ${e.message}`, { status: 502 });
  }
}