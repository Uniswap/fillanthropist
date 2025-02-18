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

  interface FillParams {
    tribunalAddress: `0x${string}`;
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
    };
    mandate: {
      recipient: `0x${string}`;
      expires: bigint;
      token: `0x${string}`;
      minimumAmount: bigint;
      baselinePriorityFee: bigint;
      scalingFactor: bigint;
      salt: `0x${string}`;
    };
    mandateChainId: bigint;
    claimant: `0x${string}`;
    priorityFeeGwei: number;
    settlementAmount: string;
    dispensation: string;
  }

  const fill = useCallback(async ({
    tribunalAddress,
    claim,
    mandate,
    mandateChainId,
    claimant,
    priorityFeeGwei,
    settlementAmount,
    dispensation,
  }: FillParams
  ) => {
    if (!walletClient || !publicClient) throw new Error('Wallet not connected');

    // Check if mandate has expired
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    if (mandate.expires <= currentTimestamp) {
      throw new Error('Mandate has expired');
    }

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
      
      // Add 25% buffer to dispensation
      const bufferedDispensation = (BigInt(dispensation) * 125n) / 100n;

      console.log('Fill value calculation:', {
        isNativeToken: mandate.token === '0x0000000000000000000000000000000000000000',
        rawDispensation: dispensation,
        bufferedDispensation: bufferedDispensation.toString(),
        settlementAmount,
        finalValue: mandate.token === '0x0000000000000000000000000000000000000000'
          ? (BigInt(settlementAmount) + bufferedDispensation).toString()
          : bufferedDispensation.toString()
      });

      // Calculate total value to send (settlement + buffered dispensation for native token, just buffered dispensation for ERC20)
      const value = mandate.token === '0x0000000000000000000000000000000000000000' 
        ? BigInt(settlementAmount) + bufferedDispensation
        : bufferedDispensation;

      // Log the exact arguments being sent to the tribunal
      console.log('Fill call arguments:', {
        tribunalAddress,
        value: value.toString(),
        args: [
          {
            chainId: claim.chainId,
            compact: {
              arbiter: claim.compact.arbiter,
              sponsor: claim.compact.sponsor,
              nonce: claim.compact.nonce,
              expires: claim.compact.expires,
              id: claim.compact.id,
              amount: claim.compact.amount
            },
            sponsorSignature: claim.sponsorSignature,
            allocatorSignature: claim.allocatorSignature
          },
          {
            recipient: mandate.recipient,
            expires: mandate.expires,
            token: mandate.token,
            minimumAmount: mandate.minimumAmount,
            baselinePriorityFee: mandate.baselinePriorityFee,
            scalingFactor: mandate.scalingFactor,
            salt: mandate.salt
          },
          claimant
        ],
        maxPriorityFeePerGas: priorityFeeWei.toString(),
        maxFeePerGas: (priorityFeeWei + ((await publicClient.getBlock()).baseFeePerGas! * 120n) / 100n).toString()
      });

      // Prepare transaction data
      const txData = encodeFunctionData({
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
        });

      // Prepare base transaction
      const baseTx = {
        to: tribunalAddress,
        value,
        data: txData,
        maxPriorityFeePerGas: priorityFeeWei,
        maxFeePerGas: priorityFeeWei + ((await publicClient.getBlock()).baseFeePerGas! * 120n) / 100n
      };

      // Estimate gas and add 25% buffer
      const estimatedGas = await publicClient.estimateGas({
        ...baseTx,
        account: walletClient.account
      });
      
      // Calculate gas with 25% buffer
      const gasWithBuffer = (estimatedGas * 125n) / 100n;
      
      // Prepare final transaction with gas estimate
      const tx = {
        ...baseTx,
        gas: gasWithBuffer
      };

      console.log('Estimated gas:', {
        estimated: estimatedGas.toString(),
        withBuffer: tx.gas.toString()
      });

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
