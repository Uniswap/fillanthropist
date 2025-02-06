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
// Validation helpers
const isValidHexString = (value: string) => {
  if (!value.startsWith('0x')) return false;
  const hex = value.slice(2);
  return hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex);
};

const isValidAddress = (value: string) => {
  if (!value.startsWith('0x')) return false;
  const hex = value.slice(2);
  return hex.length === 40 && /^[0-9a-fA-F]+$/.test(hex);
};

app.post('/broadcast', (req, res) => {
  try {
    const payload = req.body as BroadcastRequest;

    // Validate addresses
    if (!isValidAddress(payload.compact.arbiter)) {
      throw new Error('Invalid arbiter address format');
    }
    if (!isValidAddress(payload.compact.sponsor)) {
      throw new Error('Invalid sponsor address format');
    }
    if (!isValidAddress(payload.compact.mandate.tribunal)) {
      throw new Error('Invalid tribunal address format');
    }
    if (!isValidAddress(payload.compact.mandate.recipient)) {
      throw new Error('Invalid recipient address format');
    }
    if (!isValidAddress(payload.compact.mandate.token)) {
      throw new Error('Invalid token address format');
    }

    // Validate signatures
    if (!isValidHexString(payload.sponsorSignature)) {
      throw new Error('Invalid sponsor signature format');
    }
    if (!isValidHexString(payload.allocatorSignature)) {
      throw new Error('Invalid allocator signature format');
    }
    
    // Add timestamp and store the request
    const storedRequest = {
      ...payload,
      timestamp: Date.now()
    };
    broadcastStore.addRequest(storedRequest);
    
    // Broadcast to all connected WebSocket clients
    wsManager.broadcastRequest(storedRequest);
    
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
      error: error instanceof Error ? error.message : 'Invalid broadcast request'
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
