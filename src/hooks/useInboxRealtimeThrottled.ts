// Block 19680 — Inbox Performance Optimizer v1
// Throttled realtime updates for inbox to prevent UI lag

import { useEffect, useRef, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { inboxCache } from '@/lib/inbox-cache';

type RealtimeUpdate = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'inbox_messages' | 'inbox_threads' | 'reply_threads';
  data: any;
};

type UseInboxRealtimeThrottledOptions = {
  onThreadUpdate?: (thread: any) => void;
  onMessageInsert?: (message: any) => void;
  throttleMs?: number; // Default 400ms
  enabled?: boolean;
};

export function useInboxRealtimeThrottled({
  onThreadUpdate,
  onMessageInsert,
  throttleMs = 400,
  enabled = true,
}: UseInboxRealtimeThrottledOptions) {
  const supabase = createClientComponentClient();
  const updateQueue = useRef<RealtimeUpdate[]>([]);
  const throttleTimer = useRef<NodeJS.Timeout | null>(null);
  const onThreadUpdateRef = useRef(onThreadUpdate);
  const onMessageInsertRef = useRef(onMessageInsert);

  // Keep refs updated
  useEffect(() => {
    onThreadUpdateRef.current = onThreadUpdate;
    onMessageInsertRef.current = onMessageInsert;
  }, [onThreadUpdate, onMessageInsert]);

  // Process queued updates
  const processUpdates = useCallback(() => {
    if (updateQueue.current.length === 0) return;

    const updates = [...updateQueue.current];
    updateQueue.current = [];

    // Group updates by type
    const threadUpdates = new Map<string, any>();
    const messageInserts: any[] = [];

    updates.forEach((update) => {
      if (update.table === 'inbox_threads' || update.table === 'reply_threads') {
        if (update.type === 'INSERT' || update.type === 'UPDATE') {
          threadUpdates.set(update.data.id, update.data);
        }
      } else if (update.table === 'inbox_messages') {
        if (update.type === 'INSERT') {
          messageInserts.push(update.data);
        }
      }
    });

    // Process thread updates
    threadUpdates.forEach((thread) => {
      inboxCache.updateThread(thread);
      onThreadUpdateRef.current?.(thread);
    });

    // Process message inserts
    messageInserts.forEach((message) => {
      if (message.thread_id) {
        inboxCache.appendMessage(message.thread_id, message);
        onMessageInsertRef.current?.(message);
      }
    });
  }, []);

  // Throttled update handler
  const queueUpdate = useCallback((update: RealtimeUpdate) => {
    updateQueue.current.push(update);

    // Clear existing timer
    if (throttleTimer.current) {
      clearTimeout(throttleTimer.current);
    }

    // Set new timer
    throttleTimer.current = setTimeout(() => {
      processUpdates();
      throttleTimer.current = null;
    }, throttleMs);
  }, [throttleMs, processUpdates]);

  useEffect(() => {
    if (!enabled) return;

    // Subscribe to inbox_messages changes
    const messagesChannel = supabase
      .channel('inbox-messages-throttled')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
        },
        (payload) => {
          queueUpdate({
            type: 'INSERT',
            table: 'inbox_messages',
            data: payload.new,
          });
        }
      )
      .subscribe();

    // Subscribe to inbox_threads/reply_threads changes
    const threadsChannel = supabase
      .channel('inbox-threads-throttled')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inbox_threads',
        },
        (payload) => {
          queueUpdate({
            type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'inbox_threads',
            data: payload.new || payload.old,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reply_threads',
        },
        (payload) => {
          queueUpdate({
            type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'reply_threads',
            data: payload.new || payload.old,
          });
        }
      )
      .subscribe();

    return () => {
      // Cleanup
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current);
      }
      // Process any remaining updates
      processUpdates();
      
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(threadsChannel);
    };
  }, [supabase, enabled, queueUpdate, processUpdates]);
}



















































