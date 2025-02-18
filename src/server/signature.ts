import {
  keccak256,
  recoverAddress,
  toBytes,
  parseCompactSignature,
  compactSignatureToSignature,
  serializeSignature,
  encodeAbiParameters,
} from 'viem';
import type { BroadcastRequest, Mandate } from '../types/broadcast';
import { TheCompactService } from './services/TheCompactService';

// Chain-specific prefixes for signature verification
const CHAIN_PREFIXES = {
  ethereum: '0x1901afbd5f3d34c216b31ba8b82d0b32ae91e4edea92dd5bbf4c1ad028f72364a211',
  unichain: '0x190150e2b173e1ac2eac4e4995e45458f4cd549c256c423a041bf17d0c0a4a736d2c',
  base: '0x1901a1324f3bfe91ee592367ae7552e9348145e65b410335d72e4507dcedeb41bf52',
  optimism: '0x1901ea25de9c16847077fe9d95916c29598dc64f4850ba02c5dbe7800d2e2ecb338e',
} as const;

// Allocator address for signature verification
const ALLOCATOR_ADDRESS = '0x51044301738Ba2a27bd9332510565eBE9F03546b';

// The Compact typehash for registration checks
const COMPACT_REGISTRATION_TYPEHASH = '0x27f09e0bb8ce2ae63380578af7af85055d3ada248c502e2378b85bc3d05ee0b0' as const;

// Initialize TheCompactService lazily
let theCompactService: TheCompactService | null = null;

function getCompactService(): TheCompactService {
  if (!theCompactService) {
    theCompactService = new TheCompactService();
  }
  return theCompactService;
}

export function deriveClaimHash(
  arbiter: string,
  sponsor: string,
  nonce: string,
  expiration: string,
  id: string,
  amount: string,
  mandate: Mandate
): `0x${string}` {
  // First derive the mandate hash
  const mandateHash = deriveMandateHash(mandate);

  // Calculate the COMPACT_TYPEHASH
  const COMPACT_TYPE_STRING =
    'Compact(address arbiter,address sponsor,uint256 nonce,uint256 expires,uint256 id,uint256 amount,Mandate mandate)Mandate(uint256 chainId,address tribunal,address recipient,uint256 expires,address token,uint256 minimumAmount,uint256 baselinePriorityFee,uint256 scalingFactor,bytes32 salt)';
  const COMPACT_TYPEHASH = keccak256(toBytes(COMPACT_TYPE_STRING));

  // Encode all parameters including the derived mandate hash
  const encodedParameters = encodeAbiParameters(
    [
      { type: 'bytes32' }, // COMPACT_TYPEHASH
      { type: 'address' }, // arbiter
      { type: 'address' }, // sponsor
      { type: 'uint256' }, // nonce
      { type: 'uint256' }, // expires
      { type: 'uint256' }, // id
      { type: 'uint256' }, // amount
      { type: 'bytes32' }, // mandateHash
    ],
    [
      COMPACT_TYPEHASH,
      arbiter as `0x${string}`,
      sponsor as `0x${string}`,
      BigInt(nonce),
      BigInt(expiration),
      BigInt(id),
      BigInt(amount),
      mandateHash,
    ]
  );

  return keccak256(encodedParameters);
}

function deriveMandateHash(mandate: Mandate): `0x${string}` {
  const MANDATE_TYPE_STRING =
    'Mandate(uint256 chainId,address tribunal,address recipient,uint256 expires,address token,uint256 minimumAmount,uint256 baselinePriorityFee,uint256 scalingFactor,bytes32 salt)';
  const MANDATE_TYPEHASH = keccak256(toBytes(MANDATE_TYPE_STRING));
  const encodedParameters = encodeAbiParameters(
    [
      'bytes32',
      'uint256',
      'address',
      'address',
      'uint256',
      'address',
      'uint256',
      'uint256',
      'uint256',
      'bytes32',
    ].map(type => ({ type })),
    [
      MANDATE_TYPEHASH,
      BigInt(mandate.chainId),
      mandate.tribunal as `0x${string}`,
      mandate.recipient as `0x${string}`,
      BigInt(parseInt(mandate.expires)),
      mandate.token as `0x${string}`,
      BigInt(mandate.minimumAmount),
      BigInt(mandate.baselinePriorityFee),
      BigInt(mandate.scalingFactor),
      mandate.salt as `0x${string}`,
    ]
  );

  return keccak256(encodedParameters);
}

async function verifySignature(
  claimHash: string,
  signature: string,
  expectedSigner: string,
  chainPrefix: string
): Promise<boolean> {
  try {
    // Ensure hex values have 0x prefix
    const normalizedClaimHash = claimHash.startsWith('0x') ? claimHash : `0x${claimHash}`;
    const normalizedPrefix = chainPrefix.startsWith('0x') ? chainPrefix : `0x${chainPrefix}`;
    const normalizedSignature = signature.startsWith('0x') ? signature : `0x${signature}`;

    // Convert hex strings to bytes and concatenate
    const prefixBytes = toBytes(normalizedPrefix);
    const claimHashBytes = toBytes(normalizedClaimHash);

    // Concatenate bytes
    const messageBytes = new Uint8Array(prefixBytes.length + claimHashBytes.length);
    messageBytes.set(prefixBytes);
    messageBytes.set(claimHashBytes, prefixBytes.length);

    // Get the digest
    const digest = keccak256(messageBytes);

    // Convert compact signature to full signature
    const parsedCompactSig = parseCompactSignature(normalizedSignature as `0x${string}`);
    const fullSig = compactSignatureToSignature(parsedCompactSig);
    const serializedSig = serializeSignature(fullSig);

    // Recover the signer address
    const recoveredAddress = await recoverAddress({
      hash: digest,
      signature: serializedSig,
    });

    // Compare recovered address with expected signer
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

export async function verifyBroadcastRequest(request: BroadcastRequest): Promise<{ isValid: boolean; isOnchainRegistration: boolean }> {
  console.log('Received broadcast request:', {
    chainId: request.chainId,
    sponsor: request.compact.sponsor,
    arbiter: request.compact.arbiter,
    nonce: request.compact.nonce,
    expires: request.compact.expires,
    id: request.compact.id,
    amount: request.compact.amount,
    sponsorSignature: request.sponsorSignature,
    allocatorSignature: request.allocatorSignature
  });

  // Get chain prefix based on chainId
  let chainPrefix: string;
  switch (request.chainId) {
    case '1':
      chainPrefix = CHAIN_PREFIXES.ethereum;
      break;
    case '10':
      chainPrefix = CHAIN_PREFIXES.optimism;
      break;
    case '8453':
      chainPrefix = CHAIN_PREFIXES.base;
      break;
    case '130':
      chainPrefix = CHAIN_PREFIXES.unichain;
      break;
    default:
      throw new Error(`Unsupported chain ID: ${request.chainId}`);
  }

  // Derive claim hash if not provided
  const claimHash = request.claimHash || deriveClaimHash(
    request.compact.arbiter,
    request.compact.sponsor,
    request.compact.nonce || '',
    request.compact.expires,
    request.compact.id,
    request.compact.amount,
    request.compact.mandate
  );

  // Try to verify sponsor signature first
  let isSponsorValid = false;
  let registrationStatus = null;
  let isOnchainRegistration = false;
  
  try {
    console.log('Attempting to verify sponsor signature for:', {
      claimHash,
      sponsorSignature: request.sponsorSignature,
      sponsor: request.compact.sponsor,
      chainPrefix
    });
    
    isSponsorValid = await verifySignature(
      claimHash,
      request.sponsorSignature,
      request.compact.sponsor,
      chainPrefix
    );
    
    console.log('Sponsor signature verification result:', isSponsorValid);
  } catch (error) {
    console.error('Sponsor signature verification failed:', error);
  }

  // If sponsor signature is invalid or missing, check registration status
  if (!isSponsorValid) {
    console.log('Sponsor signature invalid, checking onchain registration...');
    try {
      registrationStatus = await getCompactService().getRegistrationStatus(
        parseInt(request.chainId),
        request.compact.sponsor as `0x${string}`,
        claimHash as `0x${string}`,
        COMPACT_REGISTRATION_TYPEHASH as `0x${string}`
      );

      console.log('Registration status check result:', {
        isActive: registrationStatus.isActive,
        expires: registrationStatus.expires?.toString(),
        compactExpires: request.compact.expires
      });

      if (registrationStatus.isActive) {
        isSponsorValid = true;
        isOnchainRegistration = true;
        // Override the sponsor signature with 64 bytes of zeros if registration is active
        request.sponsorSignature = '0x' + '0'.repeat(128);
        // Update expiration to be the minimum of compact.expires and registration.expires
        const compactExpires = BigInt(request.compact.expires);
        request.compact.expires = registrationStatus.expires < compactExpires ? 
          registrationStatus.expires.toString() : 
          request.compact.expires;
      }
    } catch (error) {
      console.error('Registration status check failed:', {
        error,
        chainId: request.chainId,
        sponsor: request.compact.sponsor,
        claimHash
      });
    }
  }

  if (!isSponsorValid) {
    console.error('Verification failed: Invalid sponsor signature and no active registration found', {
      sponsorSignaturePresent: !!request.sponsorSignature,
      registrationStatus: registrationStatus ? {
        isActive: registrationStatus.isActive,
        expires: registrationStatus.expires?.toString()
      } : null
    });
    return { isValid: false, isOnchainRegistration: false };
  }

  // Verify allocator signature
  const isAllocatorValid = await verifySignature(
    claimHash,
    request.allocatorSignature,
    ALLOCATOR_ADDRESS,
    chainPrefix
  );
  if (!isAllocatorValid) {
    console.error('Invalid allocator signature');
    return { isValid: false, isOnchainRegistration };
  }

  return { isValid: true, isOnchainRegistration };
}
