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

  private isStaleRequest(request: StoredRequest): boolean {
    const now = Math.floor(Date.now() / 1000); // Convert to seconds
    const HOUR_IN_SECONDS = 3600;
    
    // Convert string timestamps to numbers (assuming they're in seconds)
    const compactExpires = parseInt(request.compact.expires);
    const mandateExpires = parseInt(request.compact.mandate.expires);
    
    // Check if either expiration time is more than an hour old
    return (now - compactExpires > HOUR_IN_SECONDS) || 
           (now - mandateExpires > HOUR_IN_SECONDS);
  }

  private removeStaleRequests(): void {
    for (const [id, request] of this.requests.entries()) {
      if (this.isStaleRequest(request)) {
        this.requests.delete(id);
      }
    }
  }

  getRequests(): StoredRequest[] {
    // Remove stale requests before returning
    this.removeStaleRequests();
    
    // Return all remaining requests, sorted by timestamp
    return Array.from(this.requests.values())
      .sort((a, b) => b.timestamp - a.timestamp); // newest first
  }

  getRequest(id: string): StoredRequest | undefined {
    const request = this.requests.get(id);
    
    // If request exists and is stale, remove it and return undefined
    if (request && this.isStaleRequest(request)) {
      this.requests.delete(id);
      return undefined;
    }
    
    return request;
  }

  // Method to clear old requests based on storage timestamp
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
