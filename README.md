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
npm run dev:frontend  # Starts Vite dev server
npm run dev:server   # Starts Express server with hot reload

# For production
npm run build        # Build frontend and server
npm start           # Run production server
```

## API Documentation

### POST /broadcast

The broadcast endpoint accepts cross-chain order fill requests. This is the primary interface for submitting orders to be filled.

#### Request Payload

```typescript
interface BroadcastRequest {
  chainId: string;                // Target chain ID
  compact: CompactMessage;        // Core message data
  sponsorSignature: string;       // Signature from the sponsor
  allocatorSignature: string;     // Signature from the allocator
  context: Context;               // Additional context and quote information
  claimHash?: string;            // Optional derived claim hash
}

interface CompactMessage {
  arbiter: string;               // Address of the arbiter contract
  sponsor: string;               // Address of the sponsor
  nonce: string;                 // Transaction nonce
  expires: string;               // Expiration timestamp
  id: string;                    // Unique identifier for the swap
  amount: string;                // Amount of tokens to swap
  mandate: Mandate;              // Mandate details
}

interface Mandate {
  chainId: number;               // Chain ID for tribunal contract
  tribunal: string;              // Tribunal contract address
  recipient: string;             // Token recipient address
  expires: string;               // Mandate expiration
  token: string;                 // Token contract address
  minimumAmount: string;         // Minimum receive amount
  baselinePriorityFee: string;   // Base priority fee
  scalingFactor: string;         // Fee scaling factor
  salt: string;                  // Unique salt value
}
```

#### Context Information

The context object provides additional information about the order:

```typescript
interface Context {
  dispensation: string;           // Dispensation amount
  dispensationUSD: string;        // USD value of dispensation
  spotOutputAmount: string;       // Spot price output
  quoteOutputAmountDirect: string;// Direct quote output
  quoteOutputAmountNet: string;   // Net output after fees
  slippageBips: number;          // Slippage tolerance (basis points)
  witnessTypeString: string;      // EIP-712 type string
  witnessHash: string;           // Mandate witness hash
}
```

### WebSocket Interface

The application maintains WebSocket connections for real-time updates about order status and events. Clients can connect to receive immediate notifications about their submitted orders.

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

Copy `.env.example` to `.env` and configure the following variables:
- Server port settings
- Network configurations
- API keys (if required)
- Other environment-specific variables

## License

MIT License
