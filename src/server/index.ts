import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { fileURLToPath } from 'url';
import type { BroadcastRequest } from '../types/broadcast.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(join(__dirname, '../../dist')));

// Broadcast endpoint
app.post('/broadcast', (req, res) => {
  try {
    const payload = req.body as BroadcastRequest;
    
    // Log the received payload
    console.log('Received broadcast request:', {
      chainId: payload.chainId,
      sponsor: payload.compact.sponsor,
      id: payload.compact.id,
      expires: payload.compact.expires,
    });

    // For now, just acknowledge receipt
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
