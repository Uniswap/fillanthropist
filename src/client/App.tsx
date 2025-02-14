import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { deriveSettlementAmount } from './utils';
import { formatUnits } from 'viem';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import type { BroadcastRequest } from '../types/broadcast';
import { WagmiProvider, useAccount, useSwitchChain } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config, RainbowKitProvider, darkTheme, ConnectButton } from './config/wallet';
import { NotificationProvider } from './context/NotificationProvider';
import { useERC20 } from './hooks/useERC20';
import { useFill } from './hooks/useFill';

// Create a client
const queryClient = new QueryClient();

interface StoredRequest extends BroadcastRequest {
  timestamp: number;
}

// Helper function to format amounts - passing through raw values
function formatAmount(amount: string | null | undefined): string {
  if (amount === undefined || amount === null) {
    return '0';
  }
  return amount;
}

// Helper function to format timestamps
const formatTimestamp = (unixTimestamp: string | undefined): string => {
  if (!unixTimestamp) return '';
  const timestamp = parseInt(unixTimestamp, 10);
  if (isNaN(timestamp)) return '';
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const isToday = date.getDate() === today.getDate() &&
                  date.getMonth() === today.getMonth() &&
                  date.getFullYear() === today.getFullYear();
  
  const options: Intl.DateTimeFormatOptions = {
    ...(isToday ? {} : {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  return new Intl.DateTimeFormat('en-US', options).format(date);
};

interface BalanceInfo {
  balance: string;
  allowance?: string;
  error?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

interface CountdownTimerProps {
  timestamp: string | undefined;
}

// CountdownTimer component to display time remaining
function CountdownTimer({ timestamp }: CountdownTimerProps) {
  // Early return if no timestamp or invalid
  if (!timestamp || isNaN(parseInt(timestamp, 10))) {
    return null;
  }
  // Calculate initial time remaining
  const initialTimeRemaining = (() => {
    const now = Math.floor(Date.now() / 1000);
    const target = parseInt(timestamp, 10);
    return target - now;
  })();

  const [timeRemaining, setTimeRemaining] = useState(() => initialTimeRemaining);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const target = parseInt(timestamp, 10);
      const remaining = target - now;
      setTimeRemaining(remaining);
    };

    // Initial update
    updateTimer();

    // Update every second
    intervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timestamp]);

  // Get color based on remaining time
  const getColorClass = () => {
    if (timeRemaining <= 0) return 'text-red-500';
    if (timeRemaining < 60) return 'text-yellow-500';
    return 'text-[#00ff00]';
  };

  // Format the remaining time
  const formatTime = () => {
    if (timeRemaining <= 0) return 'Expired';
    
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s remaining`;
    }
    return `${seconds}s remaining`;
  };

  return (
    <span className={getColorClass()}>
      {formatTime()}
    </span>
  );
}

function RequestCard({ request }: { request: StoredRequest & { clientKey: string } }) {
  // Filter out requests that expired more than 10 minutes ago
  const now = Math.floor(Date.now() / 1000);
  const compactExpiry = parseInt(request.compact.expires, 10);
  if (compactExpiry + 600 < now) {
    return null;
  }
  // Store the raw slider value (0-100) and derived priority fee separately
  const [sliderValue, setSliderValue] = useState(50); // Default to midpoint
  const [priorityFee, setPriorityFee] = useState(1); // Default to 1 gwei (midpoint)
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { approve, approveMax, isLoading: isApproving } = useERC20(request.compact.mandate.token as `0x${string}`);
  const { fill } = useFill();

  // Convert slider value to priority fee using stepped linear curves
  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    // Implement stepped linear curves based on slider percentage
    let priorityFeeGwei: number;
    if (value <= 20) {
      // 0-20%: 0 to 0.01 gwei
      priorityFeeGwei = (value / 20) * 0.01;
    } else if (value <= 40) {
      // 20-40%: 0.01 to 0.1 gwei
      priorityFeeGwei = 0.01 + ((value - 20) / 20) * 0.09;
    } else if (value <= 50) {
      // 40-50%: 0.1 to 1 gwei
      priorityFeeGwei = 0.1 + ((value - 40) / 10) * 0.9;
    } else if (value <= 90) {
      // 50-90%: 1 to 10 gwei
      priorityFeeGwei = 1 + ((value - 50) / 40) * 9;
    } else {
      // 90-100%: 10 to 100 gwei
      priorityFeeGwei = 10 + ((value - 90) / 10) * 90;
    }
    setPriorityFee(priorityFeeGwei);
  };

  // Fetch balance and allowance when account is connected
  useEffect(() => {
    const fetchBalanceInfo = async () => {
      if (!address) {
        setBalanceInfo(null);
        return;
      }

      setIsLoadingBalance(true);
      try {
        const response = await fetch('/api/check-balance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chainId: Number(request.compact.mandate.chainId),
            tribunalAddress: request.compact.mandate.tribunal,
            tokenAddress: request.compact.mandate.token,
            accountAddress: address,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch balance');
        }

        const data = await response.json();
        setBalanceInfo(data);
      } catch (error) {
        setBalanceInfo({
          balance: '0',
          error: error instanceof Error ? error.message : 'Failed to fetch balance'
        });
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalanceInfo();
  }, [address, request.compact.mandate]);
  
  // Calculate settlement amount based on priority fee
  const calculatedSettlement = useMemo(() => {
    try {
      // Convert gwei to wei (1 gwei = 10^9 wei), always rounding down
      const priorityFeeWei = BigInt(Math.floor(priorityFee * 1e9));
      const minimumAmount = BigInt(request.compact.mandate.minimumAmount);
      const baselinePriorityFee = BigInt(request.compact.mandate.baselinePriorityFee);
      const scalingFactor = BigInt(request.compact.mandate.scalingFactor);
      
      return deriveSettlementAmount(
        priorityFeeWei,
        minimumAmount,
        baselinePriorityFee,
        scalingFactor
      ).toString();
    } catch (error) {
      console.error('Error calculating settlement:', error);
      return request.compact.mandate.minimumAmount;
    }
  }, [priorityFee, request.compact.mandate]);

  // Check if we need to show approval buttons
  const needsApproval = useMemo(() => {
    if (!balanceInfo || balanceInfo.symbol === 'ETH') return false;
    const settlement = BigInt(calculatedSettlement);
    const hasBalance = BigInt(balanceInfo.balance) >= settlement;
    if (!hasBalance) return false;
    if (balanceInfo.allowance === undefined) return false;
    return BigInt(balanceInfo.allowance) < settlement;
  }, [balanceInfo, calculatedSettlement]);

  // Handle approval
  const handleApproval = async (useMax: boolean) => {
    try {
      // First switch to the correct chain
      console.log('Switching to chain:', request.compact.mandate.chainId);
      await switchChainAsync({ chainId: Number(request.compact.mandate.chainId) });
      console.log('Successfully switched chain');

      // Then approve
      if (useMax) {
        await approveMax(request.compact.mandate.tribunal as `0x${string}`);
      } else {
        await approve(
          request.compact.mandate.tribunal as `0x${string}`,
          calculatedSettlement
        );
      }

      // Refresh balance info
      const response = await fetch('/api/check-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainId: Number(request.compact.mandate.chainId),
          tribunalAddress: request.compact.mandate.tribunal,
          tokenAddress: request.compact.mandate.token,
          accountAddress: address,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch updated balance');
      }

      const data = await response.json();
      setBalanceInfo(data);
    } catch (error) {
      console.error('Error during approval:', error);
    }
  };

  return (
    <div className="p-6 bg-[#0a0a0a] rounded-lg shadow-xl border border-gray-800">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-gray-100 font-mono flex items-center gap-2">
              <span>Chain {request.chainId} ({(() => {
                switch (Number(request.chainId)) {
                  case 1: return 'Ethereum';
                  case 10: return 'Optimism';
                  case 130: return 'Unichain';
                  case 8453: return 'Base';
                  default: return 'Unknown';
                }
              })()})</span>
              <span className="text-gray-400">·</span>
              <span className="text-sm">{request.claimHash}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-1 text-xs bg-[#00ff00]/10 text-[#00ff00] rounded">
                ID {request.compact.id}
              </span>
              <span className="px-2 py-1 text-xs bg-[#00ff00]/10 text-[#00ff00] rounded">
                {balanceInfo?.decimals 
                  ? `${formatUnits(BigInt(request.compact.amount), balanceInfo.decimals)} → >= ${formatUnits(BigInt(request.compact.mandate.minimumAmount), balanceInfo.decimals)} ${balanceInfo.symbol}`
                  : `${formatAmount(request.compact.amount)} → >= ${formatAmount(request.compact.mandate.minimumAmount)}`}
              </span>
              {request.context?.slippageBips !== undefined && (
                <span className="px-2 py-1 text-xs bg-orange-500/10 text-orange-500 rounded">
                  {request.context.slippageBips} bips slippage
                </span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
              }).format(new Date(request.timestamp))}
              {request.context?.dispensationUSD !== undefined && (
                <span className="ml-4 text-[#00ff00]">
                  ${request.context.dispensationUSD.replace(/^\$/, '')} fee
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Balance Info */}
      {address && (
        <div className="px-6 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {isLoadingBalance ? (
                <div className="text-sm text-gray-400">Loading balance...</div>
              ) : balanceInfo ? (
                <div>
                  <div className="text-sm">
                    <span className="text-gray-400">Fill token: </span>
                    <span className="text-[#00ff00] font-mono">{balanceInfo.name}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-400">{balanceInfo.symbol} balance: </span>
                    <span className="text-[#00ff00] font-mono">
                      {formatUnits(BigInt(balanceInfo.balance), balanceInfo.decimals || 18)}
                    </span>
                  </div>
                  {balanceInfo.symbol === 'ETH' && request.context?.dispensation && (
                    <div className="text-sm">
                      <span className="text-gray-400">Balance after dispensation: </span>
                      <span className="text-[#00ff00] font-mono">
                        {formatUnits(
                          BigInt(balanceInfo.balance) > BigInt(request.context.dispensation)
                            ? BigInt(balanceInfo.balance) - BigInt(request.context.dispensation)
                            : BigInt(0),
                          balanceInfo.decimals || 18
                        )}
                      </span>
                    </div>
                  )}
                  {balanceInfo.allowance !== undefined && balanceInfo.symbol !== 'ETH' && (
                    <div className="text-sm">
                      <span className="text-gray-400">{balanceInfo.symbol} allowance: </span>
                      <span className="text-[#00ff00] font-mono">
                        {formatUnits(BigInt(balanceInfo.allowance || '0'), balanceInfo.decimals || 18)}
                      </span>
                    </div>
                  )}
                  {balanceInfo.error && (
                    <div className="text-sm text-red-400">{balanceInfo.error}</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400">Connect wallet to view balance</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Priority Fee Slider */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-300">Priority Fee</label>
            <span className="text-sm text-gray-400">
              {priorityFee >= 100 
                ? priorityFee.toFixed(1)
                : priorityFee >= 10
                ? priorityFee.toFixed(2)
                : priorityFee >= 1
                ? priorityFee.toFixed(3)
                : priorityFee.toFixed(4)
              } gwei
            </span>
          </div>
          <div className="relative h-3 my-2">
            <div className="absolute inset-0">
              {/* Background track with fixed settlement region */}
              {(() => {
                // Convert baseline priority fee from wei to gwei
                const baselinePriorityFeeGwei = Number(request.compact.mandate.baselinePriorityFee) / 1e9;
                
                // Calculate slider position based on baseline priority fee
                let sliderPosition: number;
                if (baselinePriorityFeeGwei <= 0.01) {
                  // 0-20%: 0 to 0.01 gwei
                  sliderPosition = (baselinePriorityFeeGwei / 0.01) * 20;
                } else if (baselinePriorityFeeGwei <= 0.1) {
                  // 20-40%: 0.01 to 0.1 gwei
                  sliderPosition = 20 + ((baselinePriorityFeeGwei - 0.01) / 0.09) * 20;
                } else if (baselinePriorityFeeGwei <= 1) {
                  // 40-50%: 0.1 to 1 gwei
                  sliderPosition = 40 + ((baselinePriorityFeeGwei - 0.1) / 0.9) * 10;
                } else if (baselinePriorityFeeGwei <= 10) {
                  // 50-90%: 1 to 10 gwei
                  sliderPosition = 50 + ((baselinePriorityFeeGwei - 1) / 9) * 40;
                } else {
                  // 90-100%: 10 to 100 gwei
                  sliderPosition = 90 + ((baselinePriorityFeeGwei - 10) / 90) * 10;
                }
                
                return (
                  <>
                    {/* Base track */}
                    <div className="absolute inset-0 bg-gray-800 rounded-lg" />
                    {/* Fixed settlement region */}
                    <div 
                      className="absolute inset-y-0 left-0 bg-gray-700 rounded-l-lg transition-all duration-200"
                      style={{ width: `${sliderPosition}%` }}
                    />
                    {/* Yellow line for baseline priority fee */}
                    <div 
                      className="absolute inset-y-0 w-1 bg-yellow-500/90 shadow-[0_0_8px_rgba(234,179,8,0.5)] group cursor-help z-10"
                      style={{ left: `${sliderPosition}%` }}
                    >
                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 px-3 py-2 bg-gray-900/95 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-30">
                        <div className="text-yellow-500 font-medium mb-1">Baseline Priority Fee</div>
                        <div className="text-gray-400">
                          Settlement amount is fixed at minimum to the left.<br/>
                          Increases with priority fee to the right.
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sliderValue}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              className="absolute inset-0 appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[#00ff00] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:translate-y-[0%] [&::-webkit-slider-thumb]:top-[50%] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-[#00ff00] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-20 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:translate-y-[0%] [&::-moz-range-thumb]:top-[50%]"
              style={{ WebkitAppearance: 'none' }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm text-gray-400">Settlement Amount:</span>
            <span className={`text-sm font-mono ${(() => {
              if (!balanceInfo) return 'text-[#00ff00]';
              const settlement = BigInt(calculatedSettlement);
              
              // Handle ETH case
              if (balanceInfo.symbol === 'ETH' && request.context?.dispensation) {
                const balanceAfterDispensation = BigInt(balanceInfo.balance) > BigInt(request.context.dispensation)
                  ? BigInt(balanceInfo.balance) - BigInt(request.context.dispensation)
                  : BigInt(0);
                return balanceAfterDispensation >= settlement ? 'text-[#00ff00]' : 'text-red-500';
              }
              
              // Handle ERC20 case
              const hasBalance = BigInt(balanceInfo.balance) >= settlement;
              if (!hasBalance) return 'text-red-500';
              
              // If we have balance but it's an ERC20, check allowance
              if (balanceInfo.allowance !== undefined) {
                const hasAllowance = BigInt(balanceInfo.allowance) >= settlement;
                return hasAllowance ? 'text-[#00ff00]' : 'text-yellow-500';
              }
              
              return 'text-[#00ff00]';
            })()}`}>
              {formatUnits(BigInt(calculatedSettlement), balanceInfo?.decimals || 18)} {balanceInfo?.symbol || ''}
            </span>
          </div>
          
          {/* Fill Button */}
          {(() => {
            if (!balanceInfo) return null;
            const settlement = BigInt(calculatedSettlement);
            
            // Handle ETH case
            if (balanceInfo.symbol === 'ETH' && request.context?.dispensation) {
              const balanceAfterDispensation = BigInt(balanceInfo.balance) > BigInt(request.context.dispensation)
                ? BigInt(balanceInfo.balance) - BigInt(request.context.dispensation)
                : BigInt(0);
              if (balanceAfterDispensation >= settlement) {
                return (
                  <button
                    onClick={async () => {
                      try {
                        await fill(
                          request.compact.mandate.tribunal as `0x${string}`,
                          {
                            chainId: BigInt(request.chainId),
                            compact: {
                              arbiter: request.compact.arbiter as `0x${string}`,
                              sponsor: request.compact.sponsor as `0x${string}`,
                              nonce: BigInt(request.compact.nonce),
                              expires: BigInt(request.compact.expires),
                              id: BigInt(request.compact.id),
                              amount: BigInt(request.compact.amount)
                            },
                            sponsorSignature: request.sponsorSignature as `0x${string}`,
                            allocatorSignature: request.allocatorSignature as `0x${string}`
                          },
                          {
                            recipient: request.compact.mandate.recipient as `0x${string}`,
                            expires: BigInt(request.compact.mandate.expires),
                            token: request.compact.mandate.token as `0x${string}`,
                            minimumAmount: BigInt(request.compact.mandate.minimumAmount),
                            baselinePriorityFee: BigInt(request.compact.mandate.baselinePriorityFee),
                            scalingFactor: BigInt(request.compact.mandate.scalingFactor),
                            salt: request.compact.mandate.salt as `0x${string}`
                          },
                          BigInt(request.compact.mandate.chainId),
                          address as `0x${string}`,
                          priorityFee,
                          request.context.dispensation,
                          calculatedSettlement
                        );
                      } catch (error) {
                        console.error('Fill error:', error);
                      }
                    }}
                    className="w-full px-4 py-2 bg-[#00ff00]/10 hover:bg-[#00ff00]/20 text-[#00ff00] rounded-lg text-sm font-medium transition-colors"
                  >
                    Execute Fill
                  </button>
                );
              }
            }
            
            // Handle ERC20 case
            const hasBalance = BigInt(balanceInfo.balance) >= settlement;
            if (!hasBalance) return null;
            
            // If we have balance and it's an ERC20, check allowance
            if (balanceInfo.allowance !== undefined) {
              const hasAllowance = BigInt(balanceInfo.allowance) >= settlement;
              if (hasAllowance) {
                return (
                  <button
                    onClick={async () => {
                      try {
                        await fill(
                          request.compact.mandate.tribunal as `0x${string}`,
                          {
                            chainId: BigInt(request.chainId),
                            compact: {
                              arbiter: request.compact.arbiter as `0x${string}`,
                              sponsor: request.compact.sponsor as `0x${string}`,
                              nonce: BigInt(request.compact.nonce),
                              expires: BigInt(request.compact.expires),
                              id: BigInt(request.compact.id),
                              amount: BigInt(request.compact.amount)
                            },
                            sponsorSignature: request.sponsorSignature as `0x${string}`,
                            allocatorSignature: request.allocatorSignature as `0x${string}`
                          },
                          {
                            recipient: request.compact.mandate.recipient as `0x${string}`,
                            expires: BigInt(request.compact.mandate.expires),
                            token: request.compact.mandate.token as `0x${string}`,
                            minimumAmount: BigInt(request.compact.mandate.minimumAmount),
                            baselinePriorityFee: BigInt(request.compact.mandate.baselinePriorityFee),
                            scalingFactor: BigInt(request.compact.mandate.scalingFactor),
                            salt: request.compact.mandate.salt as `0x${string}`
                          },
                          BigInt(request.compact.mandate.chainId),
                          address as `0x${string}`,
                          priorityFee,
                          request.context.dispensation,
                          calculatedSettlement
                        );
                      } catch (error) {
                        console.error('Fill error:', error);
                      }
                    }}
                    className="w-full px-4 py-2 bg-[#00ff00]/10 hover:bg-[#00ff00]/20 text-[#00ff00] rounded-lg text-sm font-medium transition-colors"
                  >
                    Execute Fill
                  </button>
                );
              }
            }
            
            return null;
          })()}

          {/* Approval Buttons */}
          {needsApproval && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => handleApproval(false)}
                disabled={isApproving}
                className="flex-1 px-4 py-2 bg-[#00ff00]/10 hover:bg-[#00ff00]/20 text-[#00ff00] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? 'Approving...' : 'Approve Exact'}
              </button>
              <button
                onClick={() => handleApproval(true)}
                disabled={isApproving}
                className="flex-1 px-4 py-2 bg-[#00ff00]/10 hover:bg-[#00ff00]/20 text-[#00ff00] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? 'Approving...' : 'Approve Max'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Compact Message Section */}
          <section>
            <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">Compact Message</h4>
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Chain ID: </span>
                  <span className="text-gray-100">{request.chainId} ({(() => {
                    switch (Number(request.chainId)) {
                      case 1: return 'Ethereum';
                      case 10: return 'Optimism';
                      case 130: return 'Unichain';
                      case 8453: return 'Base';
                      default: return 'Unknown';
                    }
                  })()})</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Arbiter: </span>
                  <span className="text-gray-100 break-all">{request.compact.arbiter}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Sponsor: </span>
                  <span className="text-gray-100 break-all">{request.compact.sponsor}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">ID: </span>
                  <span className="text-gray-100 break-all">{request.compact.id}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Amount: </span>
                  <span className="text-gray-100">{formatAmount(request.compact.amount)}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Nonce: </span>
                  <span className="text-gray-100 break-all">{request.compact.nonce}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Expires: </span>
                  <span className="text-gray-100">
                    {formatTimestamp(request.compact.expires)}
                    <span className="ml-2">
                      <CountdownTimer timestamp={request.compact.expires} />
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Context Section */}
          <section>
            <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">Context</h4>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Spot: </span>
                  <span className="text-gray-100">{request.context?.spotOutputAmount ? Number(formatUnits(BigInt(request.context.spotOutputAmount), balanceInfo?.decimals || 18)).toFixed(8).replace(/\.?0+$/, '') : '0'} {balanceInfo?.symbol || ''}</span>
                </div>
                <div className="flex-1 p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Direct: </span>
                  <span className="text-gray-100">{request.context?.quoteOutputAmountDirect ? Number(formatUnits(BigInt(request.context.quoteOutputAmountDirect), balanceInfo?.decimals || 18)).toFixed(8).replace(/\.?0+$/, '') : '0'} {balanceInfo?.symbol || ''}</span>
                </div>
                <div className="flex-1 p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Net: </span>
                  <span className="text-gray-100">{request.context?.quoteOutputAmountNet ? Number(formatUnits(BigInt(request.context.quoteOutputAmountNet), balanceInfo?.decimals || 18)).toFixed(8).replace(/\.?0+$/, '') : '0'} {balanceInfo?.symbol || ''}</span>
                </div>
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Dispensation (quote): </span>
                <span className="text-gray-100">
                  {formatAmount(request.context?.dispensation)}
                  {request.context?.dispensationUSD && (
                    <span className="ml-1">
                      (${request.context.dispensationUSD.replace(/^\$/, '')})
                    </span>
                  )}
                </span>
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Dispensation (latest): </span>
                <QuoteDispensation
                  compact={request.compact}
                  mandate={request.compact.mandate}
                  claimant={address || ''}
                  targetChainId={Number(request.chainId)}
                  request={request}
                />
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Witness Type: </span>
                <span className="text-gray-100 break-all">{request.context?.witnessTypeString ?? 'Unknown'}</span>
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Witness Hash: </span>
                <span className="text-gray-100 break-all">{request.context?.witnessHash ?? 'N/A'}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* Mandate Section */}
          <section>
            <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">Mandate</h4>
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Chain ID: </span>
                  <span className="text-gray-100">{request.compact.mandate.chainId} ({(() => {
                    switch (Number(request.compact.mandate.chainId)) {
                      case 1: return 'Ethereum';
                      case 10: return 'Optimism';
                      case 130: return 'Unichain';
                      case 8453: return 'Base';
                      default: return 'Unknown';
                    }
                  })()})</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Tribunal: </span>
                  <span className="text-gray-100 break-all">{request.compact.mandate.tribunal}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Recipient: </span>
                  <span className="text-gray-100 break-all">{request.compact.mandate.recipient}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Token: </span>
                  <span className="text-gray-100 break-all">{request.compact.mandate.token} {balanceInfo?.name ? `(${balanceInfo.name})` : ''}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Minimum Amount: </span>
                  <span className="text-gray-100">{formatUnits(BigInt(request.compact.mandate.minimumAmount), balanceInfo?.decimals || 18)} {balanceInfo?.symbol || ''}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Expires: </span>
                  <span className="text-gray-100">
                    {formatTimestamp(request.compact.mandate.expires)}
                    <span className="ml-2">
                      <CountdownTimer timestamp={request.compact.mandate.expires} />
                    </span>
                  </span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Baseline Priority Fee: </span>
                  <span className="text-gray-100">
                    {(Number(request.compact.mandate.baselinePriorityFee) / 1e9).toFixed(3)} gwei
                  </span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Scale Factor: </span>
                  <span className="text-gray-100">{request.compact.mandate.scalingFactor}</span>
                </div>
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Salt: </span>
                <span className="text-gray-100 break-all">{request.compact.mandate.salt}</span>
              </div>
            </div>
          </section>

          {/* Signatures Section */}
          <section>
            <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">Signatures</h4>
            <div className="space-y-2">
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Sponsor: </span>
                <span className="text-gray-100 break-all">{String(request.sponsorSignature)}</span>
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Allocator: </span>
                <span className="text-gray-100 break-all">{String(request.allocatorSignature)}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Component to fetch and display quote dispensation
function QuoteDispensation({ 
  compact, 
  mandate, 
  claimant, 
  targetChainId ,
  request
}: { 
  compact: any
  mandate: any
  claimant: string
  targetChainId: number
  request: StoredRequest & { clientKey: string }
}) {
  const [quoteDispensation, setQuoteDispensation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuoteDispensation = async () => {
      if (!claimant) return;

      // Check if mandate has expired
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (BigInt(mandate.expires) <= BigInt(currentTimestamp)) {
        setError('Mandate has expired');
        return;
      }
      
      try {
        const response = await fetch('/api/quote-dispensation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            compact: {
              ...compact,
              sponsorSignature: request.sponsorSignature,
              allocatorSignature: request.allocatorSignature
            },
            mandate,
            claimant,
            targetChainId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch quote dispensation');
        }

        const data = await response.json();
        setQuoteDispensation(data.dispensation);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to fetch quote dispensation');
      }
    };

    fetchQuoteDispensation();
  }, [compact, mandate, claimant, targetChainId]);

  if (error) {
    return <span className="text-red-400">{error}</span>;
  }

  if (!quoteDispensation) {
    return <span className="text-gray-400">Loading...</span>;
  }

  const bufferedDispensation = (BigInt(quoteDispensation) * 105n) / 100n; // Add 5% buffer
  return (
    <span className="text-gray-100">
      {formatAmount(quoteDispensation)} ({formatAmount(bufferedDispensation.toString())} with 5% buffer)
    </span>
  );
}

function AppContent() {
  const [requests, setRequests] = useState<(StoredRequest & { clientKey: string })[]>([]);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [requestCounter, setRequestCounter] = useState(0);

  // Function to generate a unique client-side key using chainId, claimHash, and timestamp
  const generateClientKey = useCallback((request: StoredRequest) => {
    return `${request.chainId}-${request.claimHash}-${request.timestamp}`;
  }, []);

  // Fetch initial requests when component mounts
  useEffect(() => {
    const fetchInitialRequests = async () => {
      try {
        const response = await fetch('/api/broadcasts');
        if (!response.ok) {
          throw new Error('Failed to fetch initial requests');
        }
        const data = await response.json();
        // Add clientKey to each request
        const requestsWithKeys = data.map((request: StoredRequest) => ({
          ...request,
          clientKey: generateClientKey(request)
        }));
        setRequests(requestsWithKeys);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to fetch initial requests');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialRequests();
  }, [generateClientKey]);

  const handleWebSocketMessage = useCallback(async (data: any) => {
    if (data.type === 'newRequest') {
      const requestWithKey = {
        ...data.payload,
        clientKey: generateClientKey(data.payload)
      };
      setRequests(prev => [requestWithKey, ...prev]);

      // Fetch lock details
      try {
        const response = await fetch('/api/lock-details', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chainId: data.payload.chainId,
            id: data.payload.compact.id,
            sponsor: data.payload.compact.sponsor,
            nonce: data.payload.compact.nonce
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch lock details');
        }
        
        const lockDetails = await response.json();
        console.log('Lock details for request:', {
          requestId: data.payload.compact.id,
          chainId: data.payload.chainId,
          details: lockDetails
        });
      } catch (error) {
        console.error('Error fetching lock details:', error);
      }
    }
  }, [generateClientKey]);

  const { sendMessage, lastMessage, readyState } = useWebSocket('/ws', {
    protocols: ['fillanthropist-protocol'],
    // Connection options
    reconnectAttempts: 20,
    reconnectInterval: 1000,
    share: true, // Share a single WebSocket instance
    retryOnError: true,
    filter: () => true, // Process all messages
    heartbeat: false, // Let the server handle heartbeats
    shouldReconnect: () => true,
    
    // Event handlers
    onMessage: async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          sendMessage(JSON.stringify({ type: 'pong' }));
        } else if (data.type === 'connected') {
          console.log('Received connection confirmation:', data);
        } else if (data.type === 'newRequest') {
          // Process the request first
          await handleWebSocketMessage(data);
          // Send confirmation
          sendMessage(JSON.stringify({ 
            type: 'requestReceived',
            requestId: data.payload.compact.id,
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    },
    onOpen: () => console.log('WebSocket connected and ready'),
    onClose: (event) => console.log(`WebSocket disconnected with code ${event.code}`, event.reason),
    onError: (error) => console.error('WebSocket error:', error)
  });

  const isWsConnected = readyState === ReadyState.OPEN;

  return (
    <div className="min-h-screen bg-[#050505]">
      <header className="bg-[#0a0a0a] border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-4">
              <span><span className="text-[#00ff00]">Fill</span>anthropist</span>
              <span>🤲</span>
            </h1>
            <div className="flex items-center gap-4">
              <ConnectButton />
              {isLoading && (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#00ff00] border-t-transparent" />
              )}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800 border border-gray-700">
                <div className={`w-2.5 h-2.5 rounded-full ${isWsConnected ? 'bg-[#00ff00]' : 'bg-red-500'} shadow-sm`} />
                <span className="text-sm font-medium text-gray-300">
                  {isWsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="p-4 bg-gray-800 border border-red-900/20 rounded-lg mb-6">
            <p className="text-red-400 font-medium">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {requests.map((request) => (
            <RequestCard key={request.clientKey} request={request} />
          ))}

          {!isLoading && requests.length === 0 && !error && (
            <div className="p-6 bg-[#0a0a0a] rounded-lg shadow-xl border border-gray-800 text-center">
              <p className="text-gray-400">No broadcast requests received yet.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
