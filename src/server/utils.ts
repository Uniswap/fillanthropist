import { createPublicClient, http, formatEther, erc20Abi } from 'viem'
import type { BalanceCheckRequest, BalanceCheckResponse } from '../types/broadcast'

// RPC URLs for supported chains
const RPC_URLS: { [chainId: number]: string } = {
  10: process.env.OPTIMISM_RPC || 'https://optimism.llamarpc.com',
  8453: process.env.BASE_RPC || 'https://base.llamarpc.com'
}

export async function checkBalanceAndAllowance(
  request: BalanceCheckRequest
): Promise<BalanceCheckResponse> {
  try {
    const rpcUrl = RPC_URLS[request.chainId]
    if (!rpcUrl) {
      return { 
        balance: '0',
        error: `Unsupported chain ID: ${request.chainId}. Only Optimism (10) and Base (8453) are supported.`
      }
    }

    const publicClient = createPublicClient({
      transport: http(rpcUrl)
    })

    const zeroAddress = '0x0000000000000000000000000000000000000000' as const

    // If token is zero address, check ETH balance
    if (request.tokenAddress === zeroAddress) {
      const balance = await publicClient.getBalance({
        address: request.accountAddress as `0x${string}`
      })
      return {
        balance: formatEther(balance)
      }
    }

    // Otherwise check ERC20 balance and allowance
    const [balance, allowance] = await Promise.all([
      publicClient.readContract({
        address: request.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [request.accountAddress as `0x${string}`]
      }),
      publicClient.readContract({
        address: request.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [request.accountAddress as `0x${string}`, request.tribunalAddress as `0x${string}`]
      })
    ])

    return {
      balance: formatEther(balance),
      allowance: formatEther(allowance)
    }
  } catch (error) {
    return {
      balance: '0',
      error: error instanceof Error ? error.message : 'Unknown error checking balance'
    }
  }
}
