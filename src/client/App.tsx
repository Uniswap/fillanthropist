import { useState, useEffect, useCallback } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import type { BroadcastRequest } from '../types/broadcast';

interface StoredRequest extends BroadcastRequest {
  timestamp: number;
}

// Helper function to format large numbers with optional decimals
const formatAmount = (amount: string | undefined, decimals = 6) => {
  if (!amount) return '0';
  try {
    const num = BigInt(amount);
    const eth = Number(num) / 1e18;
    return eth.toFixed(decimals);
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

function RequestCard({ request }: { request: StoredRequest & { clientKey: string } }) {
  return (
    <div className="p-6 bg-[#0a0a0a] rounded-lg shadow-xl border border-gray-800">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-gray-100 font-mono">
              {request.compact.id}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-1 text-xs bg-[#00ff00]/10 text-[#00ff00] rounded">
                Chain {request.chainId} → {request.compact.mandate.chainId}
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
                  ${request.context.dispensationUSD} fee
                </span>
              )}
            </div>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Arbiter: </span>
                  <span className="text-gray-100">{request.compact.arbiter}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Sponsor: </span>
                  <span className="text-gray-100">{request.compact.sponsor}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">ID: </span>
                  <span className="text-gray-100">{request.compact.id}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Amount: </span>
                  <span className="text-gray-100">{formatAmount(request.compact.amount)}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Nonce: </span>
                  <span className="text-gray-100">{request.compact.nonce}</span>
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
                  <span className="text-gray-100">{formatAmount(request.context?.spotOutputAmount, 8)}</span>
                </div>
                <div className="flex-1 p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Direct: </span>
                  <span className="text-gray-100">{formatAmount(request.context?.quoteOutputAmountDirect, 8)}</span>
                </div>
                <div className="flex-1 p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Net: </span>
                  <span className="text-gray-100">{formatAmount(request.context?.quoteOutputAmountNet, 8)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Dispensation: </span>
                  <span className="text-gray-100">{formatAmount(request.context?.dispensation)}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">USD: </span>
                  <span className="text-gray-100">${request.context?.dispensationUSD ?? '0'}</span>
                </div>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Tribunal: </span>
                  <span className="text-gray-100">{request.compact.mandate.tribunal}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Recipient: </span>
                  <span className="text-gray-100">{request.compact.mandate.recipient}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Token: </span>
                  <span className="text-gray-100">{request.compact.mandate.token}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Expires: </span>
                  <span className="text-gray-100">{formatTimestamp(request.compact.mandate.expires)}</span>
                </div>
                <div className="p-3 bg-gray-800 rounded text-xs font-mono">
                  <span className="text-gray-400">Priority Fee: </span>
                  <span className="text-gray-100">{formatAmount(request.compact.mandate.baselinePriorityFee, 8)}</span>
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

function App() {
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

  const { sendMessage, lastMessage, readyState } = useWebSocket('ws://localhost:3001/ws', {
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

  // Initial fetch of existing requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/broadcasts');
        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json();
        const requestsWithKeys = data.map((request: StoredRequest) => ({
          ...request,
          clientKey: generateClientKey(request)
        }));
        setRequests(requestsWithKeys);
        setError('');
      } catch (err) {
        setError('Failed to fetch broadcast requests');
        console.error('Error fetching requests:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [generateClientKey]);

  return (
    <div className="min-h-screen bg-[#050505]">
      <header className="bg-[#0a0a0a] border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-100">Fillanthropist</h1>
            <div className="flex items-center gap-4">
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

export default App;
