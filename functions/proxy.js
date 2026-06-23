export async function onRequest(context) {
  const { request } = context;

  // 1. 专门处理非同站调用的 CORS 预检请求 (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      }
    });
  }

  // 2. 解析目标 URL
  const url = new URL(request.url);
  const target = decodeURIComponent(url.search.substring(1)); 

  if (!target || !target.startsWith('http')) {
    return new Response("Invalid Target URL: " + target, { 
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" } 
    });
  }

  // 3. 发起代理请求（重新构造干净的请求头，防止目标网站拦截跨域 Origin）
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
      }
    });

    // 4. 重构 Response，注入允许所有外部网站调用的跨域 Header
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Expose-Headers', '*'); // 允许前端获取 Content-Length 以计算进度条
    
    return newResponse;
  } catch (error) {
    return new Response("Proxy Fetch Error: " + error.message, { 
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
}
