// Block 19680 — Inbox Performance Optimizer v1
// Client-side caching for threads and messages

type Thread = {
  id: string;
  [key: string]: any;
};

type Message = {
  id: string;
  thread_id: string;
  [key: string]: any;
};

class InboxCache {
  private threadCache: Map<string, Thread> = new Map();
  private messageCache: Map<string, Message[]> = new Map(); // thread_id -> messages[]
  private threadListCache: Map<string, Thread[]> = new Map(); // filter -> threads[]
  private cacheTimestamps: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Thread list cache (keyed by filter + cursor)
  getThreadList(filter: string, cursor?: string): Thread[] | null {
    const key = `threads:${filter}:${cursor || 'initial'}`;
    const cached = this.threadListCache.get(key);
    const timestamp = this.cacheTimestamps.get(key);
    
    if (cached && timestamp && Date.now() - timestamp < this.CACHE_TTL) {
      return cached;
    }
    
    if (timestamp && Date.now() - timestamp >= this.CACHE_TTL) {
      this.threadListCache.delete(key);
      this.cacheTimestamps.delete(key);
    }
    
    return null;
  }

  setThreadList(filter: string, threads: Thread[], cursor?: string): void {
    const key = `threads:${filter}:${cursor || 'initial'}`;
    this.threadListCache.set(key, threads);
    this.cacheTimestamps.set(key, Date.now());
  }

  // Individual thread cache
  getThread(threadId: string): Thread | null {
    const cached = this.threadCache.get(threadId);
    const timestamp = this.cacheTimestamps.get(`thread:${threadId}`);
    
    if (cached && timestamp && Date.now() - timestamp < this.CACHE_TTL) {
      return cached;
    }
    
    if (timestamp && Date.now() - timestamp >= this.CACHE_TTL) {
      this.threadCache.delete(threadId);
      this.cacheTimestamps.delete(`thread:${threadId}`);
    }
    
    return null;
  }

  setThread(thread: Thread): void {
    this.threadCache.set(thread.id, thread);
    this.cacheTimestamps.set(`thread:${thread.id}`, Date.now());
  }

  // Messages cache (per thread)
  getMessages(threadId: string): Message[] | null {
    const cached = this.messageCache.get(threadId);
    const timestamp = this.cacheTimestamps.get(`messages:${threadId}`);
    
    if (cached && timestamp && Date.now() - timestamp < this.CACHE_TTL) {
      return cached;
    }
    
    if (timestamp && Date.now() - timestamp >= this.CACHE_TTL) {
      this.messageCache.delete(threadId);
      this.cacheTimestamps.delete(`messages:${threadId}`);
    }
    
    return null;
  }

  setMessages(threadId: string, messages: Message[]): void {
    this.messageCache.set(threadId, messages);
    this.cacheTimestamps.set(`messages:${threadId}`, Date.now());
  }

  // Append new message to cache (for realtime updates)
  appendMessage(threadId: string, message: Message): void {
    const cached = this.getMessages(threadId);
    if (cached) {
      // Check if message already exists
      const exists = cached.some(m => m.id === message.id);
      if (!exists) {
        cached.push(message);
        cached.sort((a, b) => {
          const aTime = new Date(a.created_at || a.received_at || 0).getTime();
          const bTime = new Date(b.created_at || b.received_at || 0).getTime();
          return aTime - bTime;
        });
        this.setMessages(threadId, cached);
      }
    }
  }

  // Update thread in cache (for realtime updates)
  updateThread(thread: Thread): void {
    this.setThread(thread);
    
    // Also update in thread list caches
    this.threadListCache.forEach((threads, key) => {
      const index = threads.findIndex(t => t.id === thread.id);
      if (index !== -1) {
        threads[index] = thread;
        this.threadListCache.set(key, threads);
      }
    });
  }

  // Clear cache for a specific thread (when thread is updated externally)
  invalidateThread(threadId: string): void {
    this.threadCache.delete(threadId);
    this.messageCache.delete(threadId);
    this.cacheTimestamps.delete(`thread:${threadId}`);
    this.cacheTimestamps.delete(`messages:${threadId}`);
    
    // Remove from list caches
    this.threadListCache.forEach((threads, key) => {
      const filtered = threads.filter(t => t.id !== threadId);
      if (filtered.length !== threads.length) {
        this.threadListCache.set(key, filtered);
      }
    });
  }

  // Clear all caches
  clear(): void {
    this.threadCache.clear();
    this.messageCache.clear();
    this.threadListCache.clear();
    this.cacheTimestamps.clear();
  }

  // Clear expired entries
  cleanup(): void {
    const now = Date.now();
    this.cacheTimestamps.forEach((timestamp, key) => {
      if (now - timestamp >= this.CACHE_TTL) {
        if (key.startsWith('threads:')) {
          const filterKey = key.replace('threads:', '');
          this.threadListCache.delete(filterKey);
        } else if (key.startsWith('thread:')) {
          const threadId = key.replace('thread:', '');
          this.threadCache.delete(threadId);
        } else if (key.startsWith('messages:')) {
          const threadId = key.replace('messages:', '');
          this.messageCache.delete(threadId);
        }
        this.cacheTimestamps.delete(key);
      }
    });
  }
}

// Singleton instance
export const inboxCache = new InboxCache();

// Cleanup expired entries every minute
if (typeof window !== 'undefined') {
  setInterval(() => {
    inboxCache.cleanup();
  }, 60 * 1000);
}



















































