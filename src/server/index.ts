import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import type { BroadcastRequest, BalanceCheckRequest } from '../types/broadcast';
import { broadcastStore } from './store';
import { WebSocketManager } from './websocket';
import { checkBalanceAndAllowance } from './utils';
import { deriveClaimHash } from '../client/utils';
import { TribunalService } from './services/TribunalService';
import { TheCompactService } from './services/TheCompactService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables before initializing services
dotenv.config({ path: join(dirname(__dirname), '..', '.env') });

const app = express();
const server = createServer(app);
const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
const [, , host, port] = serverUrl.match(/^(https?:\/\/)?([^:]+):(\d+)$/) || [];

// Initialize services
const tribunalService = new TribunalService();
const compactService = new TheCompactService();
const wsManager = new WebSocketManager(server);

// Middleware
// Configure CORS
const frontendUrl = process.env.VITE_DEV_URL || 'http://localhost:5173';

// Allow all origins for /broadcast endpoint only
app.use('/broadcast', cors());

// Restrict /api endpoints to frontend origin only
app.use('/api', cors({
  origin: frontendUrl,
  methods: ['POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type']
}));

// Configure CORS for WebSocket
const allowedOrigins = [
  serverUrl,                       // Server URL (HTTP)
  serverUrl.replace('http', 'ws'), // Server URL (WebSocket)
  frontendUrl                      // Frontend URL
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests for WebSocket
app.options('/ws', cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(join(__dirname, '../../dist')));

// Get lock details endpoint
app.post('/api/lock-details', async (req, res) => {
  const requestTime = new Date().toISOString();
  console.log(`[${requestTime}] Received POST request to /api/lock-details`);

  try {
    const { chainId, id, sponsor, nonce } = req.body;

    // Validate request parameters
    if (!chainId) throw new Error('Chain ID is required');
    if (!id) throw new Error('Lock ID is required');
    if (!sponsor || !isValidAddress(sponsor)) throw new Error('Invalid sponsor address');
    if (!nonce) throw new Error('Nonce is required');

    const details = await compactService.getLockDetailsWithStatus(
      Number(chainId),
      BigInt(id),
      sponsor as `0x${string}`,
      BigInt(nonce)
    );

    console.log(`[${requestTime}] Lock details retrieved for ID ${id}`);
    res.json(details);
  } catch (error) {
    console.error('Error getting lock details:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid lock details request'
    });
  }
});

// Get quote dispensation endpoint
app.post('/api/quote-dispensation', async (req, res) => {
  const requestTime = new Date().toISOString();
  console.log(`[${requestTime}] Received POST request to /api/quote-dispensation`);

  try {
    console.log('[quote-dispensation] Request body:', JSON.stringify(req.body, null, 2));
    
    const { compact, mandate, claimant, targetChainId } = req.body;

    // Validate request parameters
    if (!compact) throw new Error('Compact data is required');
    if (!mandate) throw new Error('Mandate data is required');
    if (!claimant) throw new Error('Claimant address is required');
    if (!targetChainId) throw new Error('Target chain ID is required');
    if (!isValidAddress(claimant)) throw new Error('Invalid claimant address');
    // Extract signatures from the request
    const sponsorSignature = compact.sponsorSignature;
    const allocatorSignature = compact.allocatorSignature;

    if (!sponsorSignature) throw new Error('Sponsor signature is required');
    if (!allocatorSignature) throw new Error('Allocator signature is required');
    
    // Validate signature format and length (65 bytes = 130 hex chars + '0x' prefix)
    const isValidSignature = (sig: string) => {
      if (!sig.startsWith('0x')) return false;
      const hex = sig.slice(2);
      return hex.length === 128 && /^[0-9a-fA-F]+$/.test(hex);
    };
    
    if (!isValidSignature(sponsorSignature)) throw new Error('Invalid sponsor signature format - must be 64 bytes');
    if (!isValidSignature(allocatorSignature)) throw new Error('Invalid allocator signature format - must be 64 bytes');

    // Transform data for TribunalService
    const transformedCompact = {
      chainId: Number(mandate.chainId),
      arbiter: compact.arbiter,
      sponsor: compact.sponsor,
      nonce: BigInt(compact.nonce),
      expires: BigInt(compact.expires),
      id: BigInt(compact.id),
      maximumAmount: BigInt(compact.amount), // Convert amount to maximumAmount
      sponsorSignature: sponsorSignature,
      allocatorSignature: allocatorSignature
    };

    const transformedMandate = {
      recipient: mandate.recipient,
      expires: BigInt(mandate.expires),
      token: mandate.token,
      minimumAmount: BigInt(mandate.minimumAmount),
      baselinePriorityFee: BigInt(mandate.baselinePriorityFee),
      scalingFactor: BigInt(mandate.scalingFactor),
      salt: mandate.salt,
    };

    // Get quote dispensation
    const dispensation = await tribunalService.getQuote(
      transformedCompact,
      transformedMandate,
      claimant,
      targetChainId
    );

    console.log(`[${requestTime}] Quote dispensation retrieved for ID ${compact.id}`);
    res.json({ dispensation: dispensation.toString() });
  } catch (error) {
    console.error('Error getting quote dispensation:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid quote dispensation request'
    });
  }
});

// Balance check endpoint
app.post('/api/check-balance', async (req, res) => {
  const requestTime = new Date().toISOString();
  console.log(`[${requestTime}] Received POST request to /api/check-balance`);

  try {
    const request = req.body as BalanceCheckRequest;
    
    // Validate request parameters
    if (!request.chainId) throw new Error('Chain ID is required');
    if (!isValidAddress(request.tribunalAddress)) throw new Error('Invalid tribunal address');
    if (!isValidAddress(request.tokenAddress)) throw new Error('Invalid token address');
    if (!isValidAddress(request.accountAddress)) throw new Error('Invalid account address');

    const result = await checkBalanceAndAllowance(request);
    
    console.log(`[${requestTime}] Balance check completed for account ${request.accountAddress}`);
    res.json(result);
  } catch (error) {
    console.error('Error checking balance:', error);
    res.status(400).json({
      balance: '0',
      error: error instanceof Error ? error.message : 'Invalid balance check request'
    });
  }
});

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
    
    // Validate chainId
    if (!payload.chainId) throw new Error('Chain ID is required');

    // Calculate claim hash
    let claimHash: string;
    try {
      claimHash = deriveClaimHash(Number(payload.chainId), payload.compact);
    } catch (error) {
      // Re-throw validation errors with more context
      throw new Error(`Failed to derive claim hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Get lock details
    try {
      const lockDetails = await compactService.getLockDetailsWithStatus(
        Number(payload.chainId),
        BigInt(payload.compact.id),
        payload.compact.sponsor as `0x${string}`,
        BigInt(payload.compact.nonce)
      );
      console.log(`[${requestTime}] Lock details for request ID ${payload.compact.id}:`, JSON.stringify(lockDetails, null, 2));
    } catch (lockError) {
      console.error(`[${requestTime}] Error getting lock details:`, lockError);
      // Continue with broadcast even if lock details fails
    }

    // Create the stored request with timestamp and claim hash
    const storedRequest = {
      ...payload,
      timestamp: Date.now(),
      claimHash
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

server.listen(parseInt(port), host, () => {
  console.log(`Server running on ${serverUrl}`);
  console.log(`WebSocket server is ready`);
  console.log('Allowed origins:', allowedOrigins);
});
