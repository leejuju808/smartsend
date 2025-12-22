/**
 * Offline cache utilities for SmartSend Inbox
 * Caches thread list and recent conversations for offline access
 */

const CACHE_PREFIX = 'smartsend_inbox_cache_'
const THREAD_LIST_KEY = `${CACHE_PREFIX}thread_list`
const THREAD_DETAIL_KEY = (threadId: string) => `${CACHE_PREFIX}thread_${threadId}`
const PENDING_MESSAGES_KEY = `${CACHE_PREFIX}pending_messages`
const MAX_CACHED_THREADS = 10

export interface CachedThread {
  id: string
  data: any
  timestamp: number
}

export interface PendingMessage {
  threadId: string
  to: string
  subject?: string
  body: string
  timestamp: number
}

/**
 * Cache thread list
 */
export function cacheThreadList(threads: any[]): void {
  try {
    const data = {
      threads,
      timestamp: Date.now(),
    }
    localStorage.setItem(THREAD_LIST_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to cache thread list:', error)
  }
}

/**
 * Get cached thread list
 */
export function getCachedThreadList(): any[] | null {
  try {
    const cached = localStorage.getItem(THREAD_LIST_KEY)
    if (!cached) return null

    const data = JSON.parse(cached)
    // Cache expires after 1 hour
    if (Date.now() - data.timestamp > 60 * 60 * 1000) {
      localStorage.removeItem(THREAD_LIST_KEY)
      return null
    }

    return data.threads
  } catch (error) {
    console.warn('Failed to get cached thread list:', error)
    return null
  }
}

/**
 * Cache thread detail
 */
export function cacheThreadDetail(threadId: string, detail: any): void {
  try {
    const data = {
      detail,
      timestamp: Date.now(),
    }
    localStorage.setItem(THREAD_DETAIL_KEY(threadId), JSON.stringify(data))

    // Keep only last MAX_CACHED_THREADS threads
    const keys = Object.keys(localStorage)
      .filter(key => key.startsWith(THREAD_DETAIL_KEY('')))
      .map(key => {
        const cached = localStorage.getItem(key)
        if (cached) {
          const data = JSON.parse(cached)
          return { key, timestamp: data.timestamp }
        }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0))

    // Remove oldest threads
    keys.slice(MAX_CACHED_THREADS).forEach(({ key }) => {
      if (key) localStorage.removeItem(key)
    })
  } catch (error) {
    console.warn('Failed to cache thread detail:', error)
  }
}

/**
 * Get cached thread detail
 */
export function getCachedThreadDetail(threadId: string): any | null {
  try {
    const cached = localStorage.getItem(THREAD_DETAIL_KEY(threadId))
    if (!cached) return null

    const data = JSON.parse(cached)
    // Cache expires after 30 minutes
    if (Date.now() - data.timestamp > 30 * 60 * 1000) {
      localStorage.removeItem(THREAD_DETAIL_KEY(threadId))
      return null
    }

    return data.detail
  } catch (error) {
    console.warn('Failed to get cached thread detail:', error)
    return null
  }
}

/**
 * Add pending message to queue
 */
export function addPendingMessage(message: PendingMessage): void {
  try {
    const pending = getPendingMessages()
    pending.push(message)
    localStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(pending))
  } catch (error) {
    console.warn('Failed to add pending message:', error)
  }
}

/**
 * Get pending messages
 */
export function getPendingMessages(): PendingMessage[] {
  try {
    const cached = localStorage.getItem(PENDING_MESSAGES_KEY)
    return cached ? JSON.parse(cached) : []
  } catch (error) {
    console.warn('Failed to get pending messages:', error)
    return []
  }
}

/**
 * Remove pending message after successful send
 */
export function removePendingMessage(timestamp: number): void {
  try {
    const pending = getPendingMessages()
    const filtered = pending.filter(msg => msg.timestamp !== timestamp)
    localStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.warn('Failed to remove pending message:', error)
  }
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  try {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith(CACHE_PREFIX)
    )
    keys.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.warn('Failed to clear cache:', error)
  }
}



















































