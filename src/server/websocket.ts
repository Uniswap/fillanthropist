import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import type { BroadcastRequest } from '../types/broadcast';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  getClientCount(): number {
    return this.clients.size;
  }

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      clientTracking: true,
      handleProtocols: () => 'fillanthropist-protocol',
      // Add WebSocket server options for stability
      perMessageDeflate: false, // Disable compression to reduce overhead
      maxPayload: 1024 * 1024, // 1MB max message size
    });
    
    this.wss.on('connection', (ws, req) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] New WebSocket connection from: ${req.socket.remoteAddress}`);
      // Log connection details
      console.log(`[${timestamp}] WebSocket connection details:`);
      console.log(`- Protocol: ${ws.protocol}`);
      console.log(`- Client state: ${ws.readyState}`);
      console.log(`- Total clients before add: ${this.clients.size}`);

      // Set WebSocket properties for stability
      ws.setMaxListeners(20); // Increase max listeners
      // @ts-ignore - Add custom property
      ws.isAlive = true;

      // Add ping/pong for connection monitoring
      const pingInterval = setInterval(() => {
        if (!(ws as any).isAlive) {
          console.log(`[${new Date().toISOString()}] Terminating inactive connection`);
          clearInterval(pingInterval);
          return ws.terminate();
        }
        (ws as any).isAlive = false;
        // Send both WebSocket-level ping and application-level ping
        ws.ping();
        ws.send(JSON.stringify({ type: 'ping' }));
      }, 5000); // More frequent pings

      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });

      this.clients.add(ws);

      // Clean up on server shutdown
      this.wss.on('close', () => {
        clearInterval(pingInterval);
      });
      console.log(`[${timestamp}] Client added. New total: ${this.clients.size}`);

      ws.on('error', (error) => {
        const errorTime = new Date().toISOString();
        console.error(`[${errorTime}] WebSocket error:`, error);
        console.error(`[${errorTime}] Client state when error occurred: ${ws.readyState}`);
        console.error(`[${errorTime}] Total clients before removal: ${this.clients.size}`);
        this.clients.delete(ws);
        console.error(`[${errorTime}] Client removed. New total: ${this.clients.size}`);
      });

      ws.on('close', (code, reason) => {
        const closeTime = new Date().toISOString();
        console.log(`[${closeTime}] WebSocket connection closing:`);
        console.log(`- Close code: ${code}`);
        console.log(`- Close reason: ${reason ? reason.toString() : 'No reason provided'}`);
        console.log(`- Client state: ${ws.readyState}`);
        console.log(`- Total clients before removal: ${this.clients.size}`);
        this.clients.delete(ws);
        console.log(`[${closeTime}] Client removed. New total: ${this.clients.size}`);
      });

      // Send immediate confirmation
      try {
        ws.send(JSON.stringify({ 
          type: 'connected',
          timestamp: timestamp,
          clientCount: this.clients.size
        }));
      } catch (error) {
        console.error(`[${timestamp}] Error sending connection confirmation:`, error);
      }

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'ping') {
            // Handle application-level ping
            (ws as any).isAlive = true;
            ws.send(JSON.stringify({ type: 'pong' }));
          } else if (message.type === 'pong') {
            // Handle application-level pong
            (ws as any).isAlive = true;
          } else if (message.type === 'requestReceived') {
            const receiptTime = new Date().toISOString();
            console.log(`[${receiptTime}] Client acknowledged request ${message.requestId}`);
            // Keep the connection alive by sending a confirmation
            ws.send(JSON.stringify({
              type: 'receiptConfirmed',
              requestId: message.requestId,
              timestamp: receiptTime
            }));
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      });
    });
  }

  async broadcastRequest(request: BroadcastRequest & { timestamp: number }): Promise<void> {
    const broadcastTime = new Date().toISOString();
    console.log(`[${broadcastTime}] Starting broadcast for request ID: ${request.compact.id}`);
    console.log(`[${broadcastTime}] Total clients to broadcast to: ${this.clients.size}`);

    const message = JSON.stringify({
      type: 'newRequest',
      payload: request,
      broadcastTimestamp: broadcastTime
    });

    let successCount = 0;
    let failCount = 0;

    // Use Promise-based send with timeout
    const sendWithTimeout = (client: WebSocket, msg: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Set a timeout of 5 seconds
        const timeout = setTimeout(() => {
          reject(new Error('Send timeout'));
        }, 5000);

        try {
          client.send(msg, (error) => {
            clearTimeout(timeout);
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    };

    // Create an array of promises for each send operation
    const sendPromises = Array.from(this.clients).map((client) => {
      if (client.readyState === WebSocket.OPEN) {
        return new Promise<boolean>((resolve) => {
          // Set up a one-time listener for the receipt confirmation
          const receiptTimeout = setTimeout(() => {
            console.log(`[${broadcastTime}] Receipt timeout for client`);
            resolve(false);
          }, 5000);

          const messageHandler = (data: Buffer | ArrayBuffer | Buffer[]) => {
            try {
              const response = JSON.parse(data.toString());
              if (response.type === 'requestReceived' && 
                  response.requestId === request.compact.id) {
                clearTimeout(receiptTimeout);
                client.removeListener('message', messageHandler);
                resolve(true);
              }
            } catch (error) {
              console.error('Error parsing receipt:', error);
            }
          };

          client.on('message', messageHandler);

          // Send the message
          sendWithTimeout(client, message)
            .then(() => {
              console.log(`[${broadcastTime}] Successfully sent to client`);
              successCount++;
            })
            .catch((error) => {
              console.error(`[${broadcastTime}] Error sending to client:`, error);
              console.error(`[${broadcastTime}] Failed client state:`, client.readyState);
              failCount++;
              clearTimeout(receiptTimeout);
              client.removeListener('message', messageHandler);
              resolve(false);
            });
        });
      } else {
        console.log(`[${broadcastTime}] Skipping client in state: ${client.readyState}`);
        return Promise.resolve(false);
      }
    });

    // Wait for all sends to complete
    await Promise.all(sendPromises);

    console.log(`[${broadcastTime}] Broadcast complete:`);
    console.log(`- Successful sends: ${successCount}`);
    console.log(`- Failed sends: ${failCount}`);
    console.log(`- Total clients: ${this.clients.size}`);
  }
}
