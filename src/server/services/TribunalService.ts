import { createPublicClient, http, PublicClient } from 'viem'
import { optimism, base } from 'viem/chains'

const TRIBUNAL_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          { name: 'id', type: 'uint256' },
          { name: 'maximumAmount', type: 'uint256' },
          { name: 'sponsorSignature', type: 'bytes' },
          { name: 'allocatorSignature', type: 'bytes' },
        ],
        name: 'compact',
        type: 'tuple',
      },
      {
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'expires', type: 'uint256' },
          { name: 'token', type: 'address' },
          { name: 'minimumAmount', type: 'uint256' },
          { name: 'baselinePriorityFee', type: 'uint256' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'salt', type: 'bytes32' },
        ],
        name: 'mandate',
        type: 'tuple',
      },
      { name: 'claimant', type: 'address' },
    ],
    name: 'quote',
    outputs: [{ name: 'dispensation', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  }
] as const

export class TribunalService {
  private optimismClient: PublicClient
  private baseClient: PublicClient

  constructor() {
    // Configure clients with specific settings for each chain
    const commonConfig = {
      pollingInterval: 4_000,
      batch: {
        multicall: true,
      },
      cacheTime: 4_000,
    }

    const optimismRpcUrl = process.env.OPTIMISM_RPC_URL || 'https://optimism.llamarpc.com'
    const baseRpcUrl = process.env.BASE_RPC_URL || 'https://base.llamarpc.com'

    this.optimismClient = createPublicClient({
      ...commonConfig,
      chain: optimism,
      transport: http(optimismRpcUrl),
    }) as PublicClient

    this.baseClient = createPublicClient({
      ...commonConfig,
      chain: base,
      transport: http(baseRpcUrl),
    }) as PublicClient
  }

  private getClientForChain(chainId: number): PublicClient {
    switch (chainId) {
      case 10:
        return this.optimismClient
      case 8453:
        return this.baseClient
      default:
        throw new Error(`Unsupported chain ID: ${chainId}. Only Optimism (10) and Base (8453) are supported.`)
    }
  }

  private getTribunalAddress(chainId: number): `0x${string}` {
    switch (chainId) {
      case 10:
        return '0xf4eA570740Ce552632F19c8E92691c6A5F6374D9'
      case 8453:
        return '0x339B234fdBa8C5C77c43AA01a6ad38071B7984F1'
      default:
        throw new Error(`No tribunal address for chain ID: ${chainId}. Only Optimism (10) and Base (8453) are supported.`)
    }
  }

  async getQuote(
    compact: {
      chainId: number
      arbiter: string
      sponsor: string
      nonce: bigint
      expires: bigint
      id: bigint
      maximumAmount: bigint
      sponsorSignature: string
      allocatorSignature: string
    },
    mandate: {
      recipient: string
      expires: bigint
      token: string
      minimumAmount: bigint
      baselinePriorityFee: bigint
      scalingFactor: bigint
      salt: string
    },
    claimant: string,
    targetChainId: number
  ): Promise<bigint> {
    try {
      const client = this.getClientForChain(targetChainId)
      const tribunalAddress = this.getTribunalAddress(targetChainId)

      console.log('[TribunalService] Simulating quote with params:', {
        address: tribunalAddress,
        functionName: 'quote',
        args: [
          {
            ...compact,
            nonce: compact.nonce.toString(),
            expires: compact.expires.toString(),
            id: compact.id.toString(),
            maximumAmount: compact.maximumAmount.toString(),
          },
          {
            ...mandate,
            expires: mandate.expires.toString(),
            minimumAmount: mandate.minimumAmount.toString(),
            baselinePriorityFee: mandate.baselinePriorityFee.toString(),
            scalingFactor: mandate.scalingFactor.toString(),
          },
          claimant
        ]
      })

      // Call the quote function on the tribunal contract
      const { result: dispensation } = await client.simulateContract({
        address: tribunalAddress,
        abi: TRIBUNAL_ABI,
        functionName: 'quote',
        args: [
          {
            chainId: compact.chainId,
            arbiter: compact.arbiter as `0x${string}`,
            sponsor: compact.sponsor as `0x${string}`,
            nonce: compact.nonce,
            expires: compact.expires,
            id: compact.id,
            maximumAmount: compact.maximumAmount,
            sponsorSignature: compact.sponsorSignature as `0x${string}`,
            allocatorSignature: compact.allocatorSignature as `0x${string}`,
          },
          {
            recipient: mandate.recipient as `0x${string}`,
            expires: mandate.expires,
            token: mandate.token as `0x${string}`,
            minimumAmount: mandate.minimumAmount,
            baselinePriorityFee: mandate.baselinePriorityFee,
            scalingFactor: mandate.scalingFactor,
            salt: mandate.salt as `0x${string}`,
          },
          claimant as `0x${string}`,
        ],
      })

      return dispensation
    } catch (error) {
      // Log the input parameters before any JSON stringification
      console.error('[TribunalService] Input parameters:')
      console.error('compact:', {
        chainId: compact.chainId,
        arbiter: compact.arbiter,
        sponsor: compact.sponsor,
        nonce: compact.nonce.toString(),
        expires: compact.expires.toString(),
        id: compact.id.toString(),
        maximumAmount: compact.maximumAmount.toString(),
        sponsorSignature: compact.sponsorSignature,
        allocatorSignature: compact.allocatorSignature,
      })
      console.error('mandate:', {
        recipient: mandate.recipient,
        expires: mandate.expires.toString(),
        token: mandate.token,
        minimumAmount: mandate.minimumAmount.toString(),
        baselinePriorityFee: mandate.baselinePriorityFee.toString(),
        scalingFactor: mandate.scalingFactor.toString(),
        salt: mandate.salt,
      })
      console.error('claimant:', claimant)
      console.error('targetChainId:', targetChainId)
      console.error(`[TribunalService] Error getting tribunal quote: ${error}`)
      throw error
    }
  }
}
