import { encodeAbiParameters, keccak256, toBytes } from 'viem'
import type { CompactMessage } from '../types/broadcast'

export function deriveClaimHash(
  chainId: number,
  compact: CompactMessage
): `0x${string}` {
  // Validate mandate parameters
  if (!compact.mandate.chainId) throw new Error('Mandate chainId is required');
  if (!compact.mandate.tribunal) throw new Error('Mandate tribunal is required');
  if (!compact.mandate.recipient) throw new Error('Mandate recipient is required');
  if (!compact.mandate.expires) throw new Error('Mandate expires is required');
  if (!compact.mandate.token) throw new Error('Mandate token is required');
  if (!compact.mandate.minimumAmount) throw new Error('Mandate minimumAmount is required');
  if (!compact.mandate.baselinePriorityFee) throw new Error('Mandate baselinePriorityFee is required');
  if (!compact.mandate.scalingFactor) throw new Error('Mandate scalingFactor is required');
  if (!compact.mandate.salt) throw new Error('Mandate salt is required');

  // Validate compact parameters
  if (!compact.arbiter) throw new Error('Compact arbiter is required');
  if (!compact.sponsor) throw new Error('Compact sponsor is required');
  if (!compact.nonce) throw new Error('Compact nonce is required');
  if (!compact.expires) throw new Error('Compact expires is required');
  if (!compact.id) throw new Error('Compact id is required');
  if (!compact.amount) throw new Error('Compact amount is required');

  // Calculate COMPACT_TYPEHASH to match Solidity's EIP-712 typed data
  const COMPACT_TYPESTRING =
    'Compact(address arbiter,address sponsor,uint256 nonce,uint256 expires,uint256 id,uint256 amount,Mandate mandate)Mandate(uint256 chainId,address tribunal,address recipient,uint256 expires,address token,uint256 minimumAmount,uint256 baselinePriorityFee,uint256 scalingFactor,bytes32 salt)'
  const COMPACT_TYPEHASH = keccak256(toBytes(COMPACT_TYPESTRING))

  // Calculate MANDATE_TYPEHASH to match Solidity's EIP-712 typed data
  const MANDATE_TYPESTRING =
    'Mandate(uint256 chainId,address tribunal,address recipient,uint256 expires,address token,uint256 minimumAmount,uint256 baselinePriorityFee,uint256 scalingFactor,bytes32 salt)'
  const MANDATE_TYPEHASH = keccak256(toBytes(MANDATE_TYPESTRING))

  // Now encode all the mandate parameters with the mandate typehash
  const encodedMandateData = encodeAbiParameters(
    [
      { type: 'bytes32' }, // MANDATE_TYPEHASH
      { type: 'uint256' }, // mandate.chainId
      { type: 'address' }, // mandate.tribunal
      { type: 'address' }, // mandate.recipient
      { type: 'uint256' }, // mandate.expires
      { type: 'address' }, // mandate.token
      { type: 'uint256' }, // mandate.minimumAmount
      { type: 'uint256' }, // mandate.baselinePriorityFee
      { type: 'uint256' }, // mandate.scalingFactor
      { type: 'bytes32' }, // mandate.salt
    ],
    [
      MANDATE_TYPEHASH,
      BigInt(compact.mandate.chainId),
      compact.mandate.tribunal.toLowerCase() as `0x${string}`,
      compact.mandate.recipient.toLowerCase() as `0x${string}`,
      BigInt(compact.mandate.expires),
      compact.mandate.token.toLowerCase() as `0x${string}`,
      BigInt(compact.mandate.minimumAmount),
      BigInt(compact.mandate.baselinePriorityFee),
      BigInt(compact.mandate.scalingFactor),
      compact.mandate.salt as `0x${string}`
    ]
  )

  // derive the "witness hash" using the mandate data
  const witnessHash: `0x${string}` = keccak256(encodedMandateData)

  // Now encode all the parameters with the typehash, matching the contract's abi.encode
  const encodedData = encodeAbiParameters(
    [
      { type: 'bytes32' }, // COMPACT_TYPEHASH
      { type: 'address' }, // arbiter
      { type: 'address' }, // sponsor
      { type: 'uint256' }, // nonce
      { type: 'uint256' }, // expires
      { type: 'uint256' }, // id
      { type: 'uint256' }, // amount
      { type: 'bytes32' }, // witnessHash
    ],
    [
      COMPACT_TYPEHASH,
      compact.arbiter.toLowerCase() as `0x${string}`,
      compact.sponsor.toLowerCase() as `0x${string}`,
      BigInt(compact.nonce),
      BigInt(compact.expires),
      BigInt(compact.id),
      BigInt(compact.amount),
      witnessHash
    ]
  )

  // Return the final hash
  return keccak256(encodedData)
}
