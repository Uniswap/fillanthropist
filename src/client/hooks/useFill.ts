import { useCallback } from 'react';
import { usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { useNotification } from '../context/useNotification';
import { parseEther, encodeFunctionData } from 'viem';

export function useFill() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { showNotification } = useNotification();

  const fill = useCallback(async (
    tribunalAddress: `0x${string}`,
    claim: any,
    mandate: any,
    directive: any,
    priorityFeeGwei: number,
    dispensation: string,
    settlementAmount: string,
  ) => {
    if (!walletClient || !publicClient) throw new Error('Wallet not connected');

    try {
      // First switch to the correct chain
      await switchChainAsync({ chainId: Number(mandate.chainId) });

      // Convert gwei to wei for priority fee
      const priorityFeeWei = parseEther(priorityFeeGwei.toString(), 'gwei');
      
      // Add 5% buffer to dispensation
      const bufferedDispensation = (BigInt(dispensation) * 105n) / 100n;

      // Calculate total value to send
      // If token is address(0), add settlement amount to buffered dispensation
      const value = mandate.token === '0x0000000000000000000000000000000000000000' 
        ? bufferedDispensation + BigInt(settlementAmount)
        : bufferedDispensation;

      // Create directive with buffered dispensation
      const directiveWithBuffer = {
        ...directive,
        dispensation: bufferedDispensation.toString()
      };

      // Prepare transaction
      const tx = {
        to: tribunalAddress,
        value,
        data: encodeFunctionData({
          abi: [{
            name: 'petition',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              {
                name: 'compact',
                type: 'tuple',
                components: [
                  { name: 'chainId', type: 'uint256' },
                  { name: 'arbiter', type: 'address' },
                  { name: 'sponsor', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'expires', type: 'uint256' },
                  { name: 'id', type: 'uint256' },
                  { name: 'maximumAmount', type: 'uint256' },
                  { name: 'sponsorSignature', type: 'bytes' },
                  { name: 'allocatorSignature', type: 'bytes' }
                ]
              },
              {
                name: 'mandate',
                type: 'tuple',
                components: [
                  { name: 'recipient', type: 'address' },
                  { name: 'expires', type: 'uint256' },
                  { name: 'token', type: 'address' },
                  { name: 'minimumAmount', type: 'uint256' },
                  { name: 'baselinePriorityFee', type: 'uint256' },
                  { name: 'scalingFactor', type: 'uint256' },
                  { name: 'salt', type: 'bytes32' }
                ]
              },
              {
                name: 'directive',
                type: 'tuple',
                components: [
                  { name: 'claimant', type: 'address' },
                  { name: 'dispensation', type: 'uint256' }
                ]
              }
            ],
            outputs: [
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'settlementAmount', type: 'uint256' },
              { name: 'claimAmount', type: 'uint256' }
            ]
          }],
          functionName: 'petition',
          args: [claim, mandate, directiveWithBuffer]
        }),
        maxPriorityFeePerGas: priorityFeeWei,
        maxFeePerGas: priorityFeeWei + ((await publicClient.getBlock()).baseFeePerGas! * 120n) / 100n
      };

      // Show initiated notification
      showNotification({
        type: 'info',
        title: 'Fill Transaction Initiated',
        message: 'Please confirm the transaction in your wallet',
        stage: 'initiated'
      });

      // Send transaction
      const hash = await walletClient.sendTransaction(tx);

      // Show submitted notification
      showNotification({
        type: 'info',
        title: 'Fill Transaction Submitted',
        message: 'Transaction has been submitted to the network',
        stage: 'submitted',
        txHash: hash,
        chainId: mandate.chainId
      });

      // Wait for transaction
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Show confirmation
      showNotification({
        type: 'success',
        title: 'Fill Transaction Confirmed',
        message: 'Transaction has been confirmed on the network',
        stage: 'confirmed',
        txHash: hash,
        chainId: mandate.chainId,
        autoHide: true
      });

      return receipt;
    } catch (error) {
      console.error('Fill error:', error);
      showNotification({
        type: 'error',
        title: 'Fill Transaction Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        autoHide: true
      });
      throw error;
    }
  }, [walletClient, publicClient, showNotification]);

  return { fill };
}
