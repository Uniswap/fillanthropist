import { createPublicClient, http, type PublicClient, type Transport, type Chain, erc20Abi, type ClientConfig } from 'viem'
import { optimism, base, mainnet } from 'viem/chains'

const THE_COMPACT_ADDRESS = '0x00000000000018DF021Ff2467dF97ff846E09f48'

const THE_COMPACT_ABI = [
  {
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'getLockDetails',
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'allocator', type: 'address' },
      { name: 'resetPeriod', type: 'uint8' },
      { name: 'noMultichain', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'nonce', type: 'uint256' },
      { name: 'allocator', type: 'address' }
    ],
    name: 'hasConsumedAllocatorNonce',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'sponsor', type: 'address' },
      { name: 'id', type: 'uint256' }
    ],
    name: 'getForcedWithdrawalStatus',
    outputs: [
      { name: 'status', type: 'uint8' },
      { name: 'withdrawableAt', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

interface LockDetails {
  token: `0x${string}`
  allocator: `0x${string}`
  resetPeriod: number
  noMultichain: boolean
  tokenInfo?: {
    name: string
    symbol: string
    decimals: number
  }
}

interface WithdrawalStatus {
  status: number
  withdrawableAt: bigint
}

export class TheCompactService {
  private mainnetClient: PublicClient
  private optimismClient: PublicClient
  private baseClient: PublicClient
  private unichainClient: PublicClient
  private lockDetailsCache: Map<string, LockDetails> = new Map()

  constructor() {
    // Configure clients with specific settings for each chain
    const commonConfig: Partial<ClientConfig> = {
      pollingInterval: 4_000,
      batch: {
        multicall: true,
      },
      cacheTime: 4_000,
    }

    const mainnetRpcUrl = process.env.ETHEREUM_RPC_URL
    const optimismRpcUrl = process.env.OPTIMISM_RPC_URL
    const baseRpcUrl = process.env.BASE_RPC_URL
    const unichainRpcUrl = process.env.UNICHAIN_RPC_URL

    if (!mainnetRpcUrl) throw new Error('ETHEREUM_RPC_URL is required')
    if (!optimismRpcUrl) throw new Error('OPTIMISM_RPC_URL is required')
    if (!baseRpcUrl) throw new Error('BASE_RPC_URL is required')
    if (!unichainRpcUrl) throw new Error('UNICHAIN_RPC_URL is required')

    this.mainnetClient = createPublicClient<Transport, Chain>({
      ...commonConfig,
      chain: mainnet,
      transport: http(mainnetRpcUrl)
    }) as PublicClient

    this.optimismClient = createPublicClient<Transport, Chain>({
      ...commonConfig,
      chain: optimism,
      transport: http(optimismRpcUrl)
    }) as PublicClient

    this.baseClient = createPublicClient<Transport, Chain>({
      ...commonConfig,
      chain: base,
      transport: http(baseRpcUrl)
    }) as PublicClient

    this.unichainClient = createPublicClient<Transport, Chain>({
      ...commonConfig,
      chain: {
        id: 130,
        name: 'Unichain',
        nativeCurrency: {
          decimals: 18,
          name: 'Ether',
          symbol: 'ETH',
        },
        rpcUrls: {
          default: { http: [unichainRpcUrl] },
          public: { http: [unichainRpcUrl] },
        },
        blockExplorers: {
          default: { name: 'Uniscan', url: 'https://uniscan.xyz/' }
        }
      },
      transport: http(unichainRpcUrl)
    }) as PublicClient
  }

  private getClientForChain(chainId: number): PublicClient {
    switch (chainId) {
      case 1:
        return this.mainnetClient
      case 10:
        return this.optimismClient
      case 8453:
        return this.baseClient
      case 130:
        return this.unichainClient
      default:
        throw new Error(`Unsupported chain ID: ${chainId}. Only Ethereum(1), Optimism (10), Base (8453), and Unichain (130) are supported.`)
    }
  }

  private getCacheKey(chainId: number, id: bigint): string {
    return `${chainId}-${id.toString()}`
  }

  private async getTokenInfo(chainId: number, tokenAddress: `0x${string}`) {
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      return undefined
    }

    const client = this.getClientForChain(chainId)
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'name'
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol'
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals'
      })
    ])

    return {
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number
    }
  }

  async getLockDetails(chainId: number, id: bigint): Promise<Omit<LockDetails, 'tokenInfo'>> {
    const cacheKey = this.getCacheKey(chainId, id)
    const cached = this.lockDetailsCache.get(cacheKey)
    if (cached) return cached

    const client = this.getClientForChain(chainId)
    
    const details = await client.readContract({
      address: THE_COMPACT_ADDRESS,
      abi: THE_COMPACT_ABI,
      functionName: 'getLockDetails',
      args: [id]
    })

    const lockDetails = {
      token: details[0],
      allocator: details[1],
      resetPeriod: details[2],
      noMultichain: details[3]
    }

    this.lockDetailsCache.set(cacheKey, lockDetails)
    return lockDetails
  }

  async hasConsumedAllocatorNonce(chainId: number, nonce: bigint, allocator: `0x${string}`): Promise<boolean> {
    const client = this.getClientForChain(chainId)
    
    return client.readContract({
      address: THE_COMPACT_ADDRESS,
      abi: THE_COMPACT_ABI,
      functionName: 'hasConsumedAllocatorNonce',
      args: [nonce, allocator]
    })
  }

  async getForcedWithdrawalStatus(chainId: number, sponsor: `0x${string}`, id: bigint): Promise<WithdrawalStatus> {
    const client = this.getClientForChain(chainId)
    
    const [status, withdrawableAt] = await client.readContract({
      address: THE_COMPACT_ADDRESS,
      abi: THE_COMPACT_ABI,
      functionName: 'getForcedWithdrawalStatus',
      args: [sponsor, id]
    })

    return { status, withdrawableAt }
  }

  async getLockDetailsWithStatus(
    chainId: number,
    id: bigint,
    sponsor: `0x${string}`,
    nonce: bigint
  ) {
    const client = this.getClientForChain(chainId)
    
    // Get lock details first since we need allocator for nonce check
    const lockDetails = await this.getLockDetails(chainId, id)

    // Then fetch everything else in parallel
    const [tokenInfo, withdrawalStatus, nonceConsumed] = await Promise.all([
      this.getTokenInfo(chainId, lockDetails.token),
      this.getForcedWithdrawalStatus(chainId, sponsor, id),
      this.hasConsumedAllocatorNonce(chainId, nonce, lockDetails.allocator)
    ])

    return {
      ...lockDetails,
      tokenInfo,
      withdrawalStatus,
      nonceConsumed
    }
  }
}
