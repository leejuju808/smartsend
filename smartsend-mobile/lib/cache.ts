// lib/cache.ts
// Block 120000 — Offline Mode Support
// Basic caching for offline usage

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'smartsend_cache_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Get cached data if available and not expired
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired
    if (now - entry.timestamp > CACHE_EXPIRY_MS) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

/**
 * Store data in cache
 */
export async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch (error) {
    console.error('Error writing cache:', error);
  }
}

/**
 * Clear all cached data
 */
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Check if device is online
 */
export function isOnline(): boolean {
  // This is a simple check - in production you might want to use NetInfo
  return true; // Assume online for now
}


























