// lib/offlineQueue.ts
// Block 238000 — Offline-First Queue System
// Handles queuing operations when offline and syncing when online

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabaseClient';

const QUEUE_PREFIX = 'smartsend_queue_';
const QUEUE_KEY = 'offline_queue';

export interface QueuedOperation {
  id: string;
  type: 'photo_upload' | 'safety_submit' | 'time_log' | 'service_update' | 'signature';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  data: any;
  filePath?: string; // For photo uploads
  retries: number;
  createdAt: number;
  lastAttempt?: number;
}

/**
 * Add operation to offline queue
 */
export async function queueOperation(operation: Omit<QueuedOperation, 'id' | 'retries' | 'createdAt'>): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const queuedOp: QueuedOperation = {
    ...operation,
    id,
    retries: 0,
    createdAt: Date.now(),
  };

  const queue = await getQueue();
  queue.push(queuedOp);
  await saveQueue(queue);

  // Try to sync immediately if online
  const isOnline = await checkOnline();
  if (isOnline) {
    syncQueue();
  }

  return id;
}

/**
 * Get all queued operations
 */
export async function getQueue(): Promise<QueuedOperation[]> {
  try {
    const queueJson = await AsyncStorage.getItem(`${QUEUE_PREFIX}${QUEUE_KEY}`);
    if (!queueJson) return [];
    return JSON.parse(queueJson);
  } catch (error) {
    console.error('Error reading queue:', error);
    return [];
  }
}

/**
 * Save queue to storage
 */
async function saveQueue(queue: QueuedOperation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${QUEUE_PREFIX}${QUEUE_KEY}`, JSON.stringify(queue));
  } catch (error) {
    console.error('Error saving queue:', error);
  }
}

/**
 * Remove operation from queue
 */
export async function removeFromQueue(operationId: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((op) => op.id !== operationId);
  await saveQueue(filtered);
}

/**
 * Check if device is online
 */
export async function checkOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}

/**
 * Sync all queued operations
 */
export async function syncQueue(): Promise<{ success: number; failed: number }> {
  const isOnline = await checkOnline();
  if (!isOnline) {
    return { success: 0, failed: 0 };
  }

  const queue = await getQueue();
  if (queue.length === 0) {
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://your-api-url.com';

  for (const operation of queue) {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        failed++;
        continue;
      }

      let response: Response;

      if (operation.type === 'photo_upload' && operation.filePath) {
        // Handle photo upload with FormData
        const formData = new FormData();
        formData.append('job_id', operation.data.job_id);
        formData.append('label', operation.data.label || 'during');
        if (operation.data.notes) formData.append('notes', operation.data.notes);
        formData.append('offline_id', operation.id);

        // Read file and append
        const fileInfo = await FileSystem.getInfoAsync(operation.filePath);
        if (!fileInfo.exists) {
          console.error('File not found:', operation.filePath);
          failed++;
          continue;
        }

        const fileUri = operation.filePath;
        const filename = fileUri.split('/').pop() || 'photo.jpg';
        const fileType = 'image/jpeg';

        formData.append('file', {
          uri: fileUri,
          name: filename,
          type: fileType,
        } as any);

        response = await fetch(`${apiBaseUrl}/api/mobile/photos/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        });
      } else {
        // Regular JSON request
        response = await fetch(`${apiBaseUrl}${operation.endpoint}`, {
          method: operation.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(operation.data),
        });
      }

      if (response.ok) {
        await removeFromQueue(operation.id);
        success++;

        // Clean up file if it was a photo upload
        if (operation.filePath) {
          try {
            await FileSystem.deleteAsync(operation.filePath, { idempotent: true });
          } catch (e) {
            console.error('Error deleting file:', e);
          }
        }
      } else {
        operation.retries++;
        operation.lastAttempt = Date.now();

        // Remove if too many retries
        if (operation.retries >= 5) {
          await removeFromQueue(operation.id);
          failed++;
        } else {
          const updatedQueue = await getQueue();
          const index = updatedQueue.findIndex((op) => op.id === operation.id);
          if (index !== -1) {
            updatedQueue[index] = operation;
            await saveQueue(updatedQueue);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing operation:', error);
      operation.retries++;
      operation.lastAttempt = Date.now();

      if (operation.retries >= 5) {
        await removeFromQueue(operation.id);
        failed++;
      } else {
        const updatedQueue = await getQueue();
        const index = updatedQueue.findIndex((op) => op.id === operation.id);
        if (index !== -1) {
          updatedQueue[index] = operation;
          await saveQueue(updatedQueue);
        }
      }
    }
  }

  return { success, failed };
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<{ pending: number; failed: number }> {
  const queue = await getQueue();
  const pending = queue.filter((op) => op.retries < 5).length;
  const failed = queue.filter((op) => op.retries >= 5).length;
  return { pending, failed };
}

























