// server.ts
const kv = await Deno.openKv();
const clients = new Set<WebSocket>();

// 统一的 CORS 头（根据你的 Netlify 域名设置）
const ALLOWED_ORIGIN = "https://infinitywechat2026.netlify.app/";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve({ hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);

  // 统一处理 OPTIONS 预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ========== 气泡数据保存 ==========
  if (url.pathname === "/save-bubbles" && req.method === "POST") {
    try {
      const bubblesData = await req.json();
      await kv.set(["bubbles", "latest"], bubblesData);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "保存失败" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ========== 气泡数据读取 ==========
  if (url.pathname === "/load-bubbles" && req.method === "GET") {
    try {
      const entry = await kv.get(["bubbles", "latest"]);
      const bubbles = entry.value || [];
      return new Response(JSON.stringify(bubbles), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ========== 历史消息读取 ==========
  if ((url.pathname === "/history" || url.pathname === "/history/") && req.method === "GET") {
    try {
      const messages = [];
      for await (const entry of kv.list({ prefix: ["messages"] })) {
        messages.push(entry.value);
      }
      messages.sort((a, b) => a.timestamp - b.timestamp);
      return new Response(JSON.stringify(messages), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("加载历史消息失败:", error);
      return new Response("服务器内部错误", {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ========== WebSocket 连接 ==========
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      clients.add(socket);
      console.log("新客户端连接 (当前在线:", clients.size, ")");
    };

    socket.onmessage = async (e) => {
      try {
        const rawData = JSON.parse(e.data);
        const messageData = {
          sender: rawData.sender || "匿名用户",
          content: rawData.content,
          time: rawData.time || new Date().toLocaleTimeString("zh-CN"),
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        };

        // 持久化到 KV
        await kv.set(["messages", messageData.id], messageData);

        // 广播给其他客户端
        clients.forEach((client) => {
          if (client !== socket && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageData));
          }
        });
      } catch (error) {
        console.error("消息处理失败:", error);
      }
    };

    socket.onclose = () => {
      clients.delete(socket);
      console.log("客户端断开 (剩余在线:", clients.size, ")");
    };

    return response;
  }

  // 默认响应
  return new Response("欢迎访问 INFINITY 聊天服务器", { headers: corsHeaders });
});
