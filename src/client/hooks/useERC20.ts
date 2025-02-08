import { useState } from 'react';
import { useWriteContract, usePublicClient, useAccount } from 'wagmi';
import { type Hash } from 'viem';
import { useNotification } from '../context/useNotification';

const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

export function useERC20(tokenAddress?: `0x${string}`) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { showNotification } = useNotification();
  const [isLoading, setIsLoading] = useState(false);

  const { writeContractAsync } = useWriteContract();

  const approve = async (spender: `0x${string}`, amount: bigint | string): Promise<Hash> => {
    if (!tokenAddress || !address) throw new Error('Not ready');
    if (!publicClient) throw new Error('Public client not available');

    setIsLoading(true);
    const tempTxId = `pending-${Date.now()}`;

    try {
      showNotification({
        type: 'info',
        title: 'Approval Transaction Initiated',
        message: 'Waiting for signature...',
        stage: 'initiated',
        txHash: tempTxId,
        autoHide: false,
      });

      const finalAmount = typeof amount === 'string' ? BigInt(amount) : amount;
      
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, finalAmount],
      });

      showNotification({
        type: 'success',
        title: 'Approval Transaction Submitted',
        message: 'Waiting for confirmation...',
        stage: 'submitted',
        txHash: hash,
        autoHide: true,
      });

      // Watch for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        showNotification({
          type: 'success',
          title: 'Approval Transaction Confirmed',
          message: 'The approval was successful',
          stage: 'confirmed',
          txHash: hash,
          autoHide: false,
        });
      }

      return hash;
    } catch (error) {
      if (error instanceof Error) {
        showNotification({
          type: 'error',
          title: 'Transaction Failed',
          message: error.message,
          txHash: tempTxId,
          autoHide: true,
        });
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    approve,
    approveMax: (spender: `0x${string}`) => approve(spender, MAX_UINT256),
    isLoading
  };
}
