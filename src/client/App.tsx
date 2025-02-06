import { useState } from 'react';
import type { BroadcastRequest } from '../types/broadcast';

function App() {
  const [response, setResponse] = useState<string>('');

  const handleBroadcast = async (payload: BroadcastRequest) => {
    try {
      const response = await fetch('/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error broadcasting request:', error);
      setResponse(JSON.stringify({ error: 'Failed to broadcast request' }, null, 2));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Fillanthropist</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Broadcast Request Viewer</h2>
          <p className="text-gray-600 mb-4">
            This interface accepts POST requests to /broadcast with cross-chain orders.
            When requests are received, they will be displayed below.
          </p>
        </div>

        {response && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Latest Response:</h3>
            <pre className="bg-gray-50 p-4 rounded overflow-auto">
              {response}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
