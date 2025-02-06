import { useState, useEffect, useCallback } from 'react';
import type { BroadcastRequest } from '../types/broadcast';

interface StoredRequest extends BroadcastRequest {
  timestamp: number;
}

// Helper function to truncate addresses
const truncateAddress = (address: string) => 
  `${address.slice(0, 6)}...${address.slice(-4)}`;

// Helper function to format large numbers
const formatAmount = (amount: string) => {
  const num = BigInt(amount);
  const eth = Number(num) / 1e18;
  return eth.toFixed(6);
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
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* Header - Always visible */}
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-150"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">
                ID: {request.compact.id}
              </h3>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                Chain {request.chainId} → {request.compact.mandate.chainId}
              </span>
              <svg 
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">
              {new Date(request.timestamp).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {formatAmount(request.compact.amount)} →{' '}
              {formatAmount(request.compact.mandate.minimumAmount)}
            </p>
            <p className="text-xs text-gray-500">
              ${request.context.dispensationUSD} fee
            </p>
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      <div 
        className={`
          border-t border-gray-100 bg-gray-50 overflow-hidden transition-all duration-200
          ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}
        `}
      >
        <div className="p-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Compact Message Section */}
            <div>
              <h4 className="font-medium mb-2 text-sm text-gray-700">Compact Message</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Arbiter</dt>
                <dd className="font-mono text-xs">{truncateAddress(request.compact.arbiter)}</dd>
                <dt className="text-gray-500">Sponsor</dt>
                <dd className="font-mono text-xs">{truncateAddress(request.compact.sponsor)}</dd>
                <dt className="text-gray-500">Nonce</dt>
                <dd>{request.compact.nonce}</dd>
                <dt className="text-gray-500">Expires</dt>
                <dd>{new Date(parseInt(request.compact.expires) * 1000).toLocaleString()}</dd>
              </dl>
            </div>

            {/* Mandate Section */}
            <div>
              <h4 className="font-medium mb-2 text-sm text-gray-700">Mandate</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Tribunal</dt>
                <dd className="font-mono text-xs">{truncateAddress(request.compact.mandate.tribunal)}</dd>
                <dt className="text-gray-500">Recipient</dt>
                <dd className="font-mono text-xs">{truncateAddress(request.compact.mandate.recipient)}</dd>
                <dt className="text-gray-500">Token</dt>
                <dd className="font-mono text-xs">{truncateAddress(request.compact.mandate.token)}</dd>
                <dt className="text-gray-500">Priority Fee</dt>
                <dd>{formatAmount(request.compact.mandate.baselinePriorityFee)}</dd>
                <dt className="text-gray-500">Scale Factor</dt>
                <dd>{request.compact.mandate.scalingFactor}</dd>
              </dl>
            </div>

            {/* Context Section */}
            <div className="col-span-2">
              <h4 className="font-medium mb-2 text-sm text-gray-700">Context</h4>
              <dl className="grid grid-cols-4 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Spot Output</dt>
                <dd>{formatAmount(request.context.spotOutputAmount)}</dd>
                <dt className="text-gray-500">Direct Output</dt>
                <dd>{formatAmount(request.context.quoteOutputAmountDirect)}</dd>
                <dt className="text-gray-500">Net Output</dt>
                <dd>{formatAmount(request.context.quoteOutputAmountNet)}</dd>
                <dt className="text-gray-500">Slippage</dt>
                <dd>{request.context.slippageBips} bips</dd>
              </dl>
            </div>

            {/* Signatures Section */}
            <div className="col-span-2 mt-2">
              <h4 className="font-medium mb-2 text-sm text-gray-700">Signatures</h4>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs">Sponsor</dt>
                  <dd className="font-mono text-xs break-all">{request.sponsorSignature}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">Allocator</dt>
                  <dd className="font-mono text-xs break-all">{request.allocatorSignature}</dd>
                </div>
              </dl>
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
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Fillanthropist</h1>
          <div className="flex items-center gap-3">
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-900 border-t-transparent" />
            )}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">
                {isWsConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <span className="text-sm text-gray-600">
              {requests.length} request{requests.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {requests.map((request) => (
            <RequestCard key={request.compact.id} request={request} />
          ))}

          {!isLoading && requests.length === 0 && !error && (
            <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
              No broadcast requests received yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
