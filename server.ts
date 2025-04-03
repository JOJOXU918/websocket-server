const kv = await Deno.openKv();
const clients = new Set<WebSocket>();

Deno.serve(
  { hostname: "0.0.0.0" },
  async (req) => {
    // 处理历史消息请求
    if (req.url === "/history") {
      try {
        const messages = [];
        for await (const entry of kv.list({ prefix: ["messages"] })) {
          messages.push(entry.value);
        }
        messages.sort((a, b) => a.timestamp - b.timestamp);
        return new Response(JSON.stringify(messages), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (error) {
        console.error("加载历史消息失败:", error);
        return new Response("服务器内部错误", { status: 500 });
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
            ...rawData,
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
