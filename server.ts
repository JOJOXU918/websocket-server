// 简易 WebSocket 广播服务器
const port = Deno.env.get("PORT") || "8000";  // 读取环境变量
console.log(`配置端口: ${port}`); // 添加此行

const clients = new Set<WebSocket>();

Deno.serve(
  { hostname: "0.0.0.0"}, // 绑定到所有网络接口
  (req) => {
  // 检查是否是 WebSocket 升级请求
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
 
    // 新客户端连接
    socket.onopen = () => {
      clients.add(socket);
      console.log("新客户端连接 (当前在线:", clients.size, ")");
    };

    // 接收消息并广播
    socket.onmessage = (e) => {
      console.log("收到消息:", e.data);
      clients.forEach(client => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(e.data);
        }
      });
    };

    // 断开连接处理
    socket.onclose = () => {
      clients.delete(socket);
      console.log("客户端断开 (剩余在线:", clients.size, ")");
    };

    return response;
  }

  // 普通 HTTP 请求响应
  return new Response("欢迎访问 INFINITY 聊天服务器");
});
