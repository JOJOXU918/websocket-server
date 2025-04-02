// 简易 WebSocket 广播服务器
const kv = await Deno.openKv();
const clients = new Set<WebSocket>();

Deno.serve(
  { hostname: "0.0.0.0"}, // 绑定到所有网络接口
  async(req) => {
  // 检查是否是 WebSocket 升级请求
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
 
    // 新客户端连接
    socket.onopen = () => {
      clients.add(socket);
      console.log("新客户端连接 (当前在线:", clients.size, ")");
    };

    // 接收消息并广播
    socket.onmessage = async (e) => {
      const message = e.data;
      console.log("收到消息:", message);

      // 持久化消息到 KV 数据库
      await kv.set(["messages", Date.now()], message);

      // 广播消息
      clients.forEach(client => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    };
    return response;
  }

  // 提供历史消息查询接口
  if (req.url === "/history") {
    const messages = [];
    for await (const entry of kv.list({ prefix: ["messages"] })) {
      messages.push(entry.value);
    }
    return new Response(JSON.stringify(messages));
  }
    
  // 普通 HTTP 请求响应
  return new Response("欢迎访问 INFINITY 聊天服务器");
});
