const { WebSocketServer, WebSocket } = require('ws');

let socketServer;

function peerProxy(httpServer) {
  socketServer = new WebSocketServer({ server: httpServer });

  socketServer.on('connection', (socket) => {
    socket.isAlive = true;

    socket.on('message', function message(data) {
      socketServer.clients.forEach((client) => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(data.toString());
        }
      });
    });

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  setInterval(() => {
    socketServer.clients.forEach((client) => {
      if (client.isAlive === false) {
        return client.terminate();
      }

      client.isAlive = false;
      client.ping();
    });
  }, 10000);
}

function broadcastNotification(messageText, sender = null) {
  if (!socketServer) return;

  const payload = JSON.stringify({
    type: 'notification',
    message: messageText,
    sender: sender,
  });

  socketServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

module.exports = { peerProxy, broadcastNotification };