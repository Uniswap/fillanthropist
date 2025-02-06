export interface BroadcastRequest {
  chainId: string;
  compact: CompactMessage;
  sponsorSignature: string;
  allocatorSignature: string;
  context: Context;
}

export interface CompactMessage {
  arbiter: string;      // Address of the arbiter contract
  sponsor: string;      // Address of the sponsor
  nonce: string;        // Transaction nonce
  expires: string;      // Expiration timestamp
  id: string;           // Unique identifier for the swap
  amount: string;       // Amount of tokens to swap
  mandate: Mandate;
}

export interface Mandate {
  chainId: number;             // Chain ID where the tribunal contract is deployed
  tribunal: string;            // Address of the tribunal contract
  recipient: string;           // Address to receive the tokens
  expires: string;             // Mandate expiration timestamp
  token: string;               // Token contract address
  minimumAmount: string;       // Minimum amount to receive
  baselinePriorityFee: string; // Base priority fee
  scalingFactor: string;       // Scaling factor for fees
  salt: string;                // Unique salt value (hex string)
}

export interface Context {
  // Quote-related information
  dispensation: string;           // Dispensation amount
  dispensationUSD: string;        // USD value of the dispensation
  spotOutputAmount: string;       // Spot price output amount
  quoteOutputAmountDirect: string;// Direct quote output amount
  quoteOutputAmountNet: string;   // Net output amount after fees

  // Slippage information
  slippageBips: number;          // Slippage tolerance in basis points

  // Witness information
  witnessTypeString: string;      // EIP-712 type string for the mandate witness
  witnessHash: string;           // Hash of the mandate witness
}
