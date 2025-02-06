import type { BroadcastRequest } from '../types/broadcast';

interface StoredRequest extends BroadcastRequest {
  timestamp: number;
}

class BroadcastStore {
  private requests: Map<string, StoredRequest> = new Map();

  addRequest(request: BroadcastRequest): void {
    this.requests.set(request.compact.id, {
      ...request,
      timestamp: Date.now(),
    });
  }

  getRequests(): StoredRequest[] {
    return Array.from(this.requests.values())
      .sort((a, b) => b.timestamp - a.timestamp); // newest first
  }

  getRequest(id: string): StoredRequest | undefined {
    return this.requests.get(id);
  }

  // Optional: Add method to clear old requests periodically
  clearOldRequests(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, request] of this.requests.entries()) {
      if (now - request.timestamp > maxAgeMs) {
        this.requests.delete(id);
      }
    }
  }
}

// Export a singleton instance
export const broadcastStore = new BroadcastStore();
