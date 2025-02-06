import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BroadcastRequest } from '../types/broadcast';
import { broadcastStore } from './store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
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
    
    // Store the request
    broadcastStore.addRequest(payload);
    
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
