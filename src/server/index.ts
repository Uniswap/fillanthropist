import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import type { BroadcastRequest } from '../types/broadcast';
import { broadcastStore } from './store';
import { WebSocketManager } from './websocket';
import { deriveClaimHash } from './utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize WebSocket manager
const wsManager = new WebSocketManager(server);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001', 'ws://localhost:3001'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests for WebSocket
app.options('/ws', cors());
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

app.post('/broadcast', async (req, res) => {
  const requestTime = new Date().toISOString();
  console.log(`[${requestTime}] Received POST request to /broadcast`);
  
  try {
    const payload = req.body as BroadcastRequest;
    console.log(`[${requestTime}] Processing broadcast request ID: ${payload.compact.id}`);

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
    
    // Calculate claim hash and add timestamp
    const storedRequest = {
      ...payload,
      timestamp: Date.now(),
      claimHash: deriveClaimHash(Number(payload.chainId), payload.compact)
    };
    broadcastStore.addRequest(storedRequest);
    
    // Log WebSocket client count before broadcast
    console.log(`[${requestTime}] Current WebSocket clients before broadcast: ${wsManager.getClientCount()}`);

    try {
      // Broadcast to WebSocket clients with a timeout
      const broadcastPromise = wsManager.broadcastRequest(storedRequest);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Broadcast timeout')), 10000); // 10 second timeout
      });

      // Race between broadcast and timeout
      await Promise.race([broadcastPromise, timeoutPromise]);

      // Send successful response
      console.log(`[${requestTime}] Sending HTTP response for request ID: ${payload.compact.id}`);
      res.json({
        success: true,
        message: 'Broadcast request received and processed',
        requestId: payload.compact.id
      });

      // Log completion
      console.log(`[${requestTime}] Completed processing broadcast request ID: ${payload.compact.id}`);
    } catch (broadcastError) {
      console.error(`[${requestTime}] Error in WebSocket broadcast:`, broadcastError);
      // Still return success since we stored the request, but include warning
      res.json({
        success: true,
        message: 'Broadcast request received but WebSocket broadcast had issues',
        requestId: payload.compact.id,
        warning: 'Some connected clients may not have received the broadcast'
      });
    }
    
    // Clean up old requests (older than 24 hours)
    broadcastStore.clearOldRequests();
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
