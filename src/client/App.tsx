import { useState, useEffect, useCallback, useMemo } from 'react';
import { deriveSettlementAmount } from './utils';
import { formatUnits } from 'viem';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import type { BroadcastRequest } from '../types/broadcast';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config, RainbowKitProvider, darkTheme, ConnectButton } from './config/wallet';

// Create a client
const queryClient = new QueryClient();

interface StoredRequest extends BroadcastRequest {
  timestamp: number;
}

// Helper function to format amounts - passing through raw values
const formatAmount = (amount: string | undefined) => {
  if (!amount) return '0';
  try {
    // Just return the raw amount string
    return amount;
  } catch (error) {
    console.error('Error formatting amount:', error);
    return '0';
  }
};

// Helper function to format timestamps
const formatTimestamp = (timestamp: string) => {
  const date = new Date(parseInt(timestamp) * 1000);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

interface BalanceInfo {
  balance: string;
  allowance?: string;
  error?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

function RequestCard({ request }: { request: StoredRequest & { clientKey: string } }) {
  const [priorityFee, setPriorityFee] = useState(0);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const { address } = useAccount();

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

  return (
    <div className="p-6 bg-[#0a0a0a] rounded-lg shadow-xl border border-gray-800">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-gray-100 font-mono flex items-center gap-2">
              <span>Chain {request.chainId}</span>
              <span className="text-gray-400">·</span>
              <span className="text-sm">{request.claimHash}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-1 text-xs bg-[#00ff00]/10 text-[#00ff00] rounded">
                ID {request.compact.id}
              </span>
              <span className="px-2 py-1 text-xs bg-[#00ff00]/10 text-[#00ff00] rounded">
                {formatAmount(request.compact.amount)} → {formatAmount(request.compact.mandate.minimumAmount)}
              </span>
              {request.context?.slippageBips !== undefined && (
                <span className="px-2 py-1 text-xs bg-orange-500/10 text-orange-500 rounded">
                  {request.context.slippageBips} bips slippage
                </span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {new Date(request.timestamp).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
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
            <span className="text-sm text-gray-400">{priorityFee} gwei</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={priorityFee}
            onChange={(e) => setPriorityFee(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#00ff00]"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm text-gray-400">Settlement Amount:</span>
            <span className={`text-sm font-mono ${(() => {
              if (!balanceInfo) return 'text-[#00ff00]';
              const settlement = BigInt(calculatedSettlement);
              if (balanceInfo.symbol === 'ETH' && request.context?.dispensation) {
                const balanceAfterDispensation = BigInt(balanceInfo.balance) > BigInt(request.context.dispensation)
                  ? BigInt(balanceInfo.balance) - BigInt(request.context.dispensation)
                  : BigInt(0);
                return balanceAfterDispensation >= settlement ? 'text-[#00ff00]' : 'text-red-500';
              }
              return BigInt(balanceInfo.balance) >= settlement ? 'text-[#00ff00]' : 'text-red-500';
            })()}`}>
              {formatUnits(BigInt(calculatedSettlement), balanceInfo?.decimals || 18)}
            </span>
          </div>
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
                  <span className="text-gray-100">{request.chainId}</span>
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
                  <span className="text-gray-100">{formatTimestamp(request.compact.expires)}</span>
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
                  <span className="text-gray-100">{formatAmount(request.context?.spotOutputAmount)}</span>
                </div>
                <div className="flex-1 p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Direct: </span>
                  <span className="text-gray-100">{formatAmount(request.context?.quoteOutputAmountDirect)}</span>
                </div>
                <div className="flex-1 p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Net: </span>
                  <span className="text-gray-100">{formatAmount(request.context?.quoteOutputAmountNet)}</span>
                </div>
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Dispensation: </span>
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
                  <span className="text-gray-100">{request.compact.mandate.chainId}</span>
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
                  <span className="text-gray-100 break-all">{request.compact.mandate.token}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Minimum Amount: </span>
                  <span className="text-gray-100">{formatAmount(request.compact.mandate.minimumAmount)}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Expires: </span>
                  <span className="text-gray-100">{formatTimestamp(request.compact.mandate.expires)}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Priority Fee: </span>
                  <span className="text-gray-100">{formatAmount(request.compact.mandate.baselinePriorityFee)}</span>
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
                <span className="text-gray-400">Sponsor Signature: </span>
                <span className="text-gray-100 break-all">{String(request.sponsorSignature)}</span>
              </div>
              <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                <span className="text-gray-400">Allocator Signature: </span>
                <span className="text-gray-100 break-all">{String(request.allocatorSignature)}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
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

  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.type === 'newRequest') {
      const requestWithKey = {
        ...data.payload,
        clientKey: generateClientKey(data.payload)
      };
      setRequests(prev => [requestWithKey, ...prev]);
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-100">Fillanthropist</h1>
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
              <div className="px-3 py-1 rounded-full bg-gray-800 border border-gray-700">
                <span className="text-sm font-medium text-gray-300">
                  {requests.length} request{requests.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
