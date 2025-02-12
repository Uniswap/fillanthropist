import { createPublicClient, http, PublicClient } from 'viem'
import { optimism, base } from 'viem/chains'

const TRIBUNAL_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'chainId', type: 'uint256' },
          {
            components: [
              { name: 'arbiter', type: 'address' },
              { name: 'sponsor', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'expires', type: 'uint256' },
              { name: 'id', type: 'uint256' },
              { name: 'amount', type: 'uint256' },
            ],
            name: 'compact',
            type: 'tuple',
          },
          { name: 'sponsorSignature', type: 'bytes' },
          { name: 'allocatorSignature', type: 'bytes' },
        ],
        name: 'claim',
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
  private unichainClient: PublicClient

  constructor() {
    // Configure clients with specific settings for each chain
    const commonConfig = {
      pollingInterval: 4_000,
      batch: {
        multicall: true,
      },
      cacheTime: 4_000,
    }

    const optimismRpcUrl = process.env.OPTIMISM_RPC_URL
    const baseRpcUrl = process.env.BASE_RPC_URL
    const unichainRpcUrl = process.env.UNICHAIN_RPC_URL

    if (!optimismRpcUrl) throw new Error('OPTIMISM_RPC_URL is required')
    if (!baseRpcUrl) throw new Error('BASE_RPC_URL is required')
    if (!unichainRpcUrl) throw new Error('UNICHAIN_RPC_URL is required')

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

    this.unichainClient = createPublicClient({
      ...commonConfig,
      chain: {
        id: 130,
        name: 'Unichain',
        network: 'unichain',
        nativeCurrency: {
          decimals: 18,
          name: 'Ether',
          symbol: 'ETH',
        },
        rpcUrls: {
          default: { http: [unichainRpcUrl] },
          public: { http: [unichainRpcUrl] },
        },
      },
      transport: http(unichainRpcUrl),
    }) as PublicClient
  }

  private getClientForChain(chainId: number): PublicClient {
    switch (chainId) {
      case 10:
        return this.optimismClient
      case 8453:
        return this.baseClient
      case 130:
        return this.unichainClient
      default:
        throw new Error(`Unsupported chain ID: ${chainId}. Only Optimism (10), Base (8453), and Unichain (130) are supported.`)
    }
  }

  private getTribunalAddress(chainId: number): `0x${string}` {
    switch (chainId) {
      case 10:
        return '0xb7dD9E63A0d594C6e58c84bB85660819B7941770'
      case 8453:
        return '0xC0AdfB14A08c5A3f0d6c21cFa601b43bA93B3c8A'
      case 130:
        return '0x7f268357A8c2552623316e2562D90e642bB538E5'
      default:
        throw new Error(`No tribunal address for chain ID: ${chainId}. Only Optimism (10), Base (8453), and Unichain (130) are supported.`)
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
            compact: {
              arbiter: compact.arbiter as `0x${string}`,
              sponsor: compact.sponsor as `0x${string}`,
              nonce: compact.nonce,
              expires: compact.expires,
              id: compact.id,
              amount: compact.maximumAmount,
            },
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
