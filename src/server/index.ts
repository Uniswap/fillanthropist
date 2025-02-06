import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import type { BroadcastRequest } from '../types/broadcast';
import { broadcastStore } from './store';
import { WebSocketManager } from './websocket';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize WebSocket manager
const wsManager = new WebSocketManager(server);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(join(__dirname, '../../dist')));

// Get all broadcast requests
app.get('/api/broadcasts', (req, res) => {
  const requests = broadcastStore.getRequests();
  res.json(requests);
});

// Get a specific broadcast request
app.get('/api/broadcasts/:id', (req, res) => {
  const request = broadcastStore.getRequest(req.params.id);
  if (request) {
    res.json(request);
  } else {
    res.status(404).json({ error: 'Broadcast request not found' });
  }
});

// Broadcast endpoint
app.post('/broadcast', (req, res) => {
  try {
    const payload = req.body as BroadcastRequest;
    
    // Add timestamp and store the request
    const storedRequest = {
      ...payload,
      timestamp: Date.now()
    };
    broadcastStore.addRequest(storedRequest);
    
    // Broadcast to all connected WebSocket clients
    wsManager.broadcastRequest(storedRequest);
    
    // Log the received payload
    console.log('Received broadcast request:', {
      chainId: payload.chainId,
      sponsor: payload.compact.sponsor,
      id: payload.compact.id,
      expires: payload.compact.expires,
    });

    // Clean up old requests (older than 24 hours)
    broadcastStore.clearOldRequests();

    res.json({
      success: true,
      message: 'Broadcast request received',
      requestId: payload.compact.id
    });
  } catch (error) {
    console.error('Error processing broadcast request:', error);
    res.status(400).json({
      success: false,
      error: 'Invalid broadcast request'
    });
  }
});

// Serve the frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../../dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server is ready`);
});
