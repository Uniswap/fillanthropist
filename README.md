# Fillanthropist

> A filler — with a human in the loop!

Fillanthropist is a lightweight server + web3 frontend application designed for receiving broadcasted cross-chain swap intents, powered by [The Compact](https://github.com/uniswap/the-compact) on a "claim" chain and [Tribunal](https://github.com/uniswap/tribunal) on a "fill" chain, and filling those intents.

The project consists of an Express server that accepts POST requests for broadcasting fill orders, and a React-based web3 frontend that interacts with the server through both HTTP and WebSocket connections.

⚠️ **Note: This project is meant to serve as a demonstration of what is required to operate a basic filler. It is still under active development and should be used with caution.**

## Overview

Fillanthropist facilitates cross-chain order filling by:
- Accepting and validating broadcast requests for order fills
- Managing WebSocket connections for real-time updates
- Providing a web3 frontend for submitting transactions using Viem + Wagmi

A hosted version of Fillanthropist can be found at [fillanthropist.org](https://fillanthropist.org/) (though it is not set up for heavy traffic and comes with no uptime guarantees).

## Installation

```bash
# Clone the repository
git clone https://github.com/uniswap/fillanthropist
cd fillanthropist

# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
```

## Running the Application

```bash
# Start both frontend and server in development mode
npm run dev

# Or run frontend and server separately
npm run dev:frontend # Starts Vite dev server
npm run dev:server   # Starts Express server with hot reload

# For production
npm run build        # Build frontend and server
npm start            # Run production server
```

## API Documentation

### POST /broadcast

The broadcast endpoint accepts cross-chain order fill requests. This is the primary interface for submitting orders to be filled.

#### Request Payload

```typescript
interface BroadcastRequest {
  chainId: string;             // Target chain ID where tokens are claimed
  compact: CompactMessage;     // Core message data for the claim
  sponsorSignature: string;    // Signature from the sponsor
  allocatorSignature: string;  // Signature from the allocator
  context: Context;            // Additional context and quote information
  claimHash?: string;          // Optional derived claim hash
}

interface CompactMessage {
  arbiter: string;             // Address of the arbiter contract
  sponsor: string;             // Address of the claim sponsor
  nonce: string;               // Nonce scoped to allocator for replay protection
  expires: string;             // Claim must be processed by this time
  id: string;                  // Unique identifier for the swap
  amount: string;              // Amount of tokens to swap
  mandate: Mandate;            // Mandate details
}

interface Mandate {
  chainId: number;             // Chain ID for tribunal contract
  tribunal: string;            // Tribunal contract address
  recipient: string;           // Required token recipient address
  expires: string;             // Settlement must be filled by this time
  token: string;               // Settlement oken contract address
  minimumAmount: string;       // Minimum amount that must be supplied
  baselinePriorityFee: string; // Base priority fee — amount scaling kicks in at higher priority fees
  scalingFactor: string;       // Priority gas fee scaling factor
  salt: string;                // Unique salt value
}
```

#### Context Information

The context object provides additional information about the order; it's not strictly necessary, but gives the filler more helpful information about the swap:

```typescript
interface Context {
  dispensation: string;           // Expected cross-chain message cost
  dispensationUSD: string;        // USD value of dispensation
  spotOutputAmount: string;       // Spot price output from CoinGecko
  quoteOutputAmountDirect: string;// Direct quote output from Uniswap
  quoteOutputAmountNet: string;   // Net output after fees
  slippageBips: number;           // Slippage tolerance (basis points)
  witnessTypeString: string;      // EIP-712 type string
  witnessHash: string;            // Mandate witness hash
}
```

### WebSocket Interface

The application maintains WebSocket connections for real-time updates about order status and events. Clients can connect to receive immediate notifications about any submitted swap requests. Clients can also query the server's api endpoints for recent requests as well as for information like token metadata, balances, approvals, and lock details.

## Development

```bash
# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm run test
```

## Environment Variables

Copy `.env.example` to `.env` and configure variables like RPC URLs and WalletConnect IDs as necessary.

## License

MIT License
