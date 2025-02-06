import { useState, useEffect, useCallback } from 'react';
import type { BroadcastRequest } from '../types/broadcast';

interface StoredRequest extends BroadcastRequest {
  timestamp: number;
}

// Helper function to format large numbers with optional decimals
const formatAmount = (amount: string, decimals = 6) => {
  const num = BigInt(amount);
  const eth = Number(num) / 1e18;
  return eth.toFixed(decimals);
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

function useWebSocket(url: string, onMessage: (data: any) => void) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      // Try to reconnect in 3 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        useWebSocket(url, onMessage);
      }, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [url, onMessage]);

  return isConnected;
}

function RequestCard({ request }: { request: StoredRequest }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg border border-gray-200 group">
      {/* Header - Always visible */}
      <div className="border-b border-gray-100">
        <div className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold font-mono text-gray-900">
                    {request.compact.id}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                    Chain {request.chainId} → {request.compact.mandate.chainId}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100">
                    {formatAmount(request.compact.amount)} → {formatAmount(request.compact.mandate.minimumAmount)}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium border border-purple-100">
                    {request.context.slippageBips} bips slippage
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-500" title="Timestamp">
                  {new Date(request.timestamp).toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
                <span className="font-medium text-blue-600" title="Dispensation Fee">
                  ${request.context.dispensationUSD} fee
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div>
        <div className="p-4 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              {/* Compact Message Section */}
              <section>
                <h4 className="font-medium mb-3 text-sm text-gray-700 uppercase tracking-wider">Compact Message</h4>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Arbiter: </span>
                      {request.compact.arbiter}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Sponsor: </span>
                      {request.compact.sponsor}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">ID: </span>
                      {request.compact.id}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Amount: </span>
                      {formatAmount(request.compact.amount)}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Nonce: </span>
                      {request.compact.nonce}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Expires: </span>
                      {formatTimestamp(request.compact.expires)}
                    </span>
                  </div>
                </dl>
              </section>

              {/* Context Section */}
              <section>
                <h4 className="font-medium mb-3 text-sm text-gray-700 uppercase tracking-wider">Context</h4>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="col-span-2 flex gap-2">
                    <div className="flex-1 bg-white px-2 py-1 rounded border border-gray-200">
                      <span className="font-mono text-xs">
                        <span className="text-gray-500">Spot: </span>
                        {formatAmount(request.context.spotOutputAmount, 8)}
                      </span>
                    </div>
                    <div className="flex-1 bg-white px-2 py-1 rounded border border-gray-200">
                      <span className="font-mono text-xs">
                        <span className="text-gray-500">Direct: </span>
                        {formatAmount(request.context.quoteOutputAmountDirect, 8)}
                      </span>
                    </div>
                    <div className="flex-1 bg-white px-2 py-1 rounded border border-gray-200">
                      <span className="font-mono text-xs">
                        <span className="text-gray-500">Net: </span>
                        {formatAmount(request.context.quoteOutputAmountNet, 8)}
                      </span>
                    </div>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Dispensation: </span>
                      {formatAmount(request.context.dispensation)}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">USD: </span>
                      ${request.context.dispensationUSD}
                    </span>
                  </div>
                  <div className="col-span-2 bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Witness Type: </span>
                      <span className="break-all">{request.context.witnessTypeString}</span>
                    </span>
                  </div>
                  <div className="col-span-2 bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Witness Hash: </span>
                      <span className="break-all">{request.context.witnessHash}</span>
                    </span>
                  </div>
                </dl>
              </section>
            </div>

            <div className="space-y-6">
              {/* Mandate Section */}
              <section>
                <h4 className="font-medium mb-3 text-sm text-gray-700 uppercase tracking-wider">Mandate</h4>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Tribunal: </span>
                      {request.compact.mandate.tribunal}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Recipient: </span>
                      {request.compact.mandate.recipient}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Token: </span>
                      {request.compact.mandate.token}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Expires: </span>
                      {formatTimestamp(request.compact.mandate.expires)}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Priority Fee: </span>
                      {formatAmount(request.compact.mandate.baselinePriorityFee, 8)}
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Scale Factor: </span>
                      {request.compact.mandate.scalingFactor}
                    </span>
                  </div>
                  <div className="col-span-2 bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Salt: </span>
                      <span className="break-all">{request.compact.mandate.salt}</span>
                    </span>
                  </div>
                </dl>
              </section>

              {/* Signatures Section */}
              <section>
                <h4 className="font-medium mb-3 text-sm text-gray-700 uppercase tracking-wider">Signatures</h4>
                <dl className="grid gap-2 text-sm">
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Sponsor Signature: </span>
                      <span className="break-all">{request.sponsorSignature}</span>
                    </span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-gray-200">
                    <span className="font-mono text-xs">
                      <span className="text-gray-500">Allocator Signature: </span>
                      <span className="break-all">{request.allocatorSignature}</span>
                    </span>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [requests, setRequests] = useState<StoredRequest[]>([]);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.type === 'newRequest') {
      setRequests(prev => [data.payload, ...prev]);
    }
  }, []);

  const isWsConnected = useWebSocket('ws://localhost:3001', handleWebSocketMessage);

  // Initial fetch of existing requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/broadcasts');
        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json();
        setRequests(data);
        setError('');
      } catch (err) {
        setError('Failed to fetch broadcast requests');
        console.error('Error fetching requests:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Fillanthropist</h1>
            <div className="flex items-center gap-4">
              {isLoading && (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-900 border-t-transparent" />
              )}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200">
                <div className={`w-2.5 h-2.5 rounded-full ${isWsConnected ? 'bg-green-500' : 'bg-red-500'} shadow-sm`} />
                <span className="text-sm font-medium text-gray-700">
                  {isWsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="px-3 py-1 rounded-full bg-gray-50 border border-gray-200">
                <span className="text-sm font-medium text-gray-700">
                  {requests.length} request{requests.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {requests.map((request) => (
            <RequestCard key={request.compact.id} request={request} />
          ))}

          {!isLoading && requests.length === 0 && !error && (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500 border border-gray-200">
              No broadcast requests received yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
