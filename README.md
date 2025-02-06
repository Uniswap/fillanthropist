# Fillanthropist

A lightweight server + web3 frontend that accepts POST requests with cross-chain orders to fill.

## Features

- Express server handling broadcast requests
- Web3 frontend using Viem + Wagmi
- TypeScript support
- Cross-chain order filling capability

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## API Documentation

### POST /broadcast

Accepts cross-chain order fill requests with the following payload structure:

```typescript
interface BroadcastRequest {
  chainId: string;
  compact: CompactMessage;
  sponsorSignature: string;
  allocatorSignature: string;
  context: Context;
}
```

See source code for detailed type definitions and documentation.
