import { useCallback } from 'react';
import { usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { useNotification } from '../context/useNotification';
import { parseEther, encodeFunctionData } from 'viem';
import { chains } from '../config/wallet';

export function useFill() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { showNotification } = useNotification();

  const fill = useCallback(async (
    tribunalAddress: `0x${string}`,
    claim: {
      chainId: bigint;
      compact: {
        arbiter: `0x${string}`;
        sponsor: `0x${string}`;
        nonce: bigint;
        expires: bigint;
        id: bigint;
        amount: bigint;
      };
      sponsorSignature: `0x${string}`;
      allocatorSignature: `0x${string}`;
    },
    mandate: {
      recipient: `0x${string}`;
      expires: bigint;
      token: `0x${string}`;
      minimumAmount: bigint;
      baselinePriorityFee: bigint;
      scalingFactor: bigint;
      salt: `0x${string}`;
    },
    mandateChainId: bigint,
    claimant: `0x${string}`,
    priorityFeeGwei: number,
    settlementAmount: string,
    dispensation: string,
  ) => {
    if (!walletClient || !publicClient) throw new Error('Wallet not connected');

    try {
      // Only switch chains if we're not already on the correct chain
      const currentChainId = await walletClient.getChainId();
      const mandateChainIdNumber = Number(mandateChainId);
      const targetChain = chains.find(chain => chain.id === mandateChainIdNumber);
      if (!targetChain) {
        throw new Error(`Chain ID ${mandateChainIdNumber} not configured`);
      }
      if (currentChainId !== mandateChainIdNumber) {
        await switchChainAsync({ chainId: mandateChainIdNumber });
      }

      // Convert gwei to wei for priority fee
      const priorityFeeWei = parseEther(priorityFeeGwei.toString(), 'gwei');
      
      // Calculate total value to send (settlement + dispensation for native token, just dispensation for ERC20)
      const value = mandate.token === '0x0000000000000000000000000000000000000000' 
        ? BigInt(settlementAmount) + BigInt(dispensation)
        : BigInt(dispensation);

      // Prepare transaction
      const tx = {
        to: tribunalAddress,
        value,
        data: encodeFunctionData({
          abi: [{
            name: 'fill',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              {
                name: 'claim',
                type: 'tuple',
                components: [
                  { name: 'chainId', type: 'uint256' },
                  {
                    name: 'compact',
                    type: 'tuple',
                    components: [
                      { name: 'arbiter', type: 'address' },
                      { name: 'sponsor', type: 'address' },
                      { name: 'nonce', type: 'uint256' },
                      { name: 'expires', type: 'uint256' },
                      { name: 'id', type: 'uint256' },
                      { name: 'amount', type: 'uint256' }
                    ]
                  },
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
              { name: 'claimant', type: 'address' }
            ],
            outputs: [
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'settlementAmount', type: 'uint256' },
              { name: 'claimAmount', type: 'uint256' }
            ]
          }],
          functionName: 'fill',
          args: [claim, mandate, claimant]
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
        chainId: Number(mandateChainId)
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
        chainId: Number(mandateChainId),
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
