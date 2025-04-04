const kv = await Deno.openKv();
const clients = new Set<WebSocket>();


Deno.serve(
  { hostname: "0.0.0.0" },
  async (req) => {
    const url = new URL(req.url);

      // ================== 统一处理 OPTIONS 请求 ==================
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "https://infinitywechat.netlify.app",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400" // 缓存 24 小时
      }
    });
  }



    // 处理气泡数据保存 (POST)
    if (url.pathname === "/save-bubbles") {
      try {
        const bubblesData = await req.json();
        await kv.set(["bubbles", "latest"], bubblesData); // 存储气泡数据
      
        return new Response(JSON.stringify({ success: true }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://infinitywechat.netlify.app" // 精确域名
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "保存失败" }), {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "https://infinitywechat.netlify.app"  }
        });
      }
    }

    if (url.pathname === "/load-bubbles") {
      try {
        const entry = await kv.get(["bubbles", "latest"]);
        const bubbles = entry.value || [];
        
        return new Response(JSON.stringify(bubbles), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://infinitywechat.netlify.app"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify([]), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://infinitywechat.netlify.app"
          }
        });
      }
    }

    // 处理历史消息请求
    if (url.pathname === "/history"|| url.pathname === "/history/") {
      if (req.method === "OPTIONS") {
        // 响应预检请求
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
      }

      try {
        
        const messages = [];

        // 从 KV 读取数据
        for await (const entry of kv.list({ prefix: ["messages"] })) {
          messages.push(entry.value);
        }

        // 按时间排序
        messages.sort((a, b) => a.timestamp - b.timestamp);
        
        // 返回 JSON 并允许跨域
        return new Response(JSON.stringify(messages), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (error) {
        console.error("加载历史消息失败:", error);
        return new Response("服务器内部错误", { 
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 处理 WebSocket 请求
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
            sender: rawData.sender || "匿名用户", // 确保必填字段
            content: rawData.content,
            time: rawData.time || new Date().toLocaleTimeString("zh-CN"),
            timestamp: Date.now(),
            id: crypto.randomUUID()
          };
          
          // 持久化到 KV
          await kv.set(["messages", messageData.id], messageData);

          // 广播结构化数据
          clients.forEach(client => {
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

    return new Response("欢迎访问 INFINITY 聊天服务器");
  }
);
