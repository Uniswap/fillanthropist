import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import type { BroadcastRequest } from '../types/broadcast';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws) => {
      console.log('Client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      // Send initial ping to verify connection
      ws.send(JSON.stringify({ type: 'ping' }));
    });
  }

  broadcastRequest(request: BroadcastRequest & { timestamp: number }) {
    const message = JSON.stringify({
      type: 'newRequest',
      payload: request
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
