import { useState } from 'react';
import { useWriteContract, usePublicClient, useAccount } from 'wagmi';
import { type Hash, type TransactionReceipt } from 'viem';
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
      
      console.log('Initiating approval transaction...');
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, finalAmount],
      });
      console.log('Transaction submitted with hash:', hash);

      showNotification({
        type: 'success',
        title: 'Approval Transaction Submitted',
        message: 'Waiting for confirmation...',
        stage: 'submitted',
        txHash: hash,
        autoHide: true,
      });

      // Watch for confirmation with timeout
      console.log('Waiting for transaction confirmation...');
      try {
        const receipt = await Promise.race([
          publicClient.waitForTransactionReceipt({ hash }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
          )
        ]) as TransactionReceipt;
        
        console.log('Transaction receipt received:', receipt);

        if (receipt.status === "success") {
          console.log('Transaction confirmed successfully');
          showNotification({
            type: 'success',
            title: 'Approval Transaction Confirmed',
            message: 'The approval was successful',
            stage: 'confirmed',
            txHash: hash,
            autoHide: false,
          });
        } else {
          console.log('Transaction reverted');
          showNotification({
            type: 'error',
            title: 'Transaction Failed',
            message: 'The transaction was reverted',
            txHash: hash,
            autoHide: true,
          });
          throw new Error('Transaction reverted');
        }

        return hash;
      } catch (error) {
        console.error('Transaction confirmation error:', error);
        const isTimeout = error instanceof Error && error.message.includes('timeout');
        showNotification({
          type: 'error',
          title: 'Transaction Failed',
          message: isTimeout ? 'Transaction confirmation timed out' : 'Failed to confirm transaction',
          txHash: hash,
          autoHide: true,
        });
        throw error;
      }
    } catch (error) {
      console.error('Transaction error:', error);
      const errorMessage = error instanceof Error 
        ? error.message
        : 'Unknown error occurred';
      showNotification({
        type: 'error',
        title: 'Transaction Failed',
        message: errorMessage,
        txHash: tempTxId,
        autoHide: true,
      });
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
