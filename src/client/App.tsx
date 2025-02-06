import { useState, useEffect } from 'react';
import type { BroadcastRequest } from '../types/broadcast';

interface StoredRequest extends BroadcastRequest {
  timestamp: number;
}

function App() {
  const [requests, setRequests] = useState<StoredRequest[]>([]);
  const [error, setError] = useState<string>('');

  // Fetch requests on mount and every 5 seconds
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await fetch('/api/broadcasts');
        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json();
        setRequests(data);
        setError('');
      } catch (err) {
        setError('Failed to fetch broadcast requests');
        console.error('Error fetching requests:', err);
      }
    };

    // Initial fetch
    fetchRequests();

    // Set up polling
    const interval = setInterval(fetchRequests, 5000);

    // Cleanup
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Fillanthropist</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Broadcast Request Viewer</h2>
          <p className="text-gray-600 mb-4">
            This interface accepts POST requests to /broadcast with cross-chain orders.
            Requests will appear below as they are received.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.compact.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    Request ID: {request.compact.id}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Received: {new Date(request.timestamp).toLocaleString()}
                  </p>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  Chain ID: {request.chainId}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Compact Details</h4>
                  <dl className="space-y-1 text-sm">
                    <dt className="text-gray-500">Sponsor</dt>
                    <dd className="font-mono">{request.compact.sponsor}</dd>
                    <dt className="text-gray-500">Amount</dt>
                    <dd>{request.compact.amount}</dd>
                    <dt className="text-gray-500">Expires</dt>
                    <dd>{new Date(parseInt(request.compact.expires) * 1000).toLocaleString()}</dd>
                  </dl>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Mandate Details</h4>
                  <dl className="space-y-1 text-sm">
                    <dt className="text-gray-500">Recipient</dt>
                    <dd className="font-mono">{request.compact.mandate.recipient}</dd>
                    <dt className="text-gray-500">Token</dt>
                    <dd className="font-mono">{request.compact.mandate.token}</dd>
                    <dt className="text-gray-500">Minimum Amount</dt>
                    <dd>{request.compact.mandate.minimumAmount}</dd>
                  </dl>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t">
                <h4 className="font-medium mb-2">Context</h4>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-500">Dispensation</dt>
                    <dd>{request.context.dispensation}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Dispensation USD</dt>
                    <dd>${request.context.dispensationUSD}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Slippage (bips)</dt>
                    <dd>{request.context.slippageBips}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ))}

          {requests.length === 0 && !error && (
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
