// Block 19680 — Inbox Performance Optimizer v1
// Split-pane layout: Lead List | Thread View | Lead Info Panel
// Optimized with cursor pagination, caching, and throttled realtime

"use client";

import { useEffect, useState, useCallback } from "react";
import { LeadList } from "@/components/inbox/v2/LeadList";
import { MessageBubble } from "@/components/inbox/v2/MessageBubble";
import { LeadInfoPanel } from "@/components/inbox/v2/LeadInfoPanel";
import { ComposerV2 } from "@/components/inbox/v2/ComposerV2";
import { BulkControls } from "@/components/inbox/v2/BulkControls";
import { TaskSidebar } from "@/components/inbox/v2/TaskSidebar";
import { ThreadListSkeleton, MessageListSkeleton } from "@/components/inbox-v2/InboxV2Skeleton";
import { toast } from "sonner";
import { inboxCache } from "@/lib/inbox-cache";
import { useInboxRealtimeThrottled } from "@/hooks/useInboxRealtimeThrottled";

type Thread = {
  id: string;
  lead: {
    id: string;
    name: string;
    email: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    state?: string;
    status: string;
    estimated_value?: number;
  };
  campaign: { id: string; name: string } | null;
  latest_intent: string;
  unread_count: number;
  last_message_at: string;
  snippet: string;
  pinned: boolean;
  has_notes: boolean;
  suppressed: boolean;
};

type Message = {
  id: string;
  direction: "in" | "out";
  body_html?: string | null;
  body_text?: string | null;
  sent_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
  has_quoted_text?: boolean;
};

type ThreadDetail = {
  thread: {
    id: string;
    pinned: boolean;
    latest_intent: string;
    status: string;
    unread_count: number;
  };
  lead: Thread["lead"];
  campaign: Thread["campaign"];
  messages: Message[];
  notes: Array<{ id: string; body: string; created_at: string }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    due_at?: string;
    completed: boolean;
  }>;
};

type Filter = "all" | "hot" | "new_replies" | "follow_up" | "warm" | "not_interested";

export default function InboxV2Page() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Throttled realtime updates
  useInboxRealtimeThrottled({
    onThreadUpdate: (thread) => {
      setThreads((prev) => {
        const index = prev.findIndex((t) => t.id === thread.id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...thread };
          return updated;
        }
        return prev;
      });
    },
    onMessageInsert: (message) => {
      if (message.thread_id === selectedThreadId && threadDetail) {
        setThreadDetail((prev) => {
          if (!prev) return prev;
          const exists = prev.messages.some((m) => m.id === message.id);
          if (!exists) {
            return {
              ...prev,
              messages: [...prev.messages, message],
            };
          }
          return prev;
        });
      }
    },
  });

  // Load threads with cursor-based pagination and caching
  const loadThreads = useCallback(async (reset = false, nextCursor?: string | null) => {
    if ((loading && !reset) || (loadingMore && !reset)) return; // Prevent concurrent loads
    
    // Check cache first
    const cacheKey = nextCursor || (reset ? null : cursor);
    const cached = cacheKey ? inboxCache.getThreadList(filter, cacheKey) : inboxCache.getThreadList(filter);
    
    if (cached && reset) {
      setThreads(cached);
      setLoading(false);
      return;
    }
    
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const params = new URLSearchParams({
        filter,
        limit: "25", // Smaller page size for better performance
      });

      if (nextCursor || (!reset && cursor)) {
        params.append("cursor", nextCursor || cursor || "");
      }

      const res = await fetch(`/api/inbox/v2/threads?${params}`);
      if (!res.ok) throw new Error("Failed to load threads");

      const data = await res.json();
      
      // Cache the results
      inboxCache.setThreadList(filter, data.threads, cacheKey || undefined);
      
      if (reset) {
        setThreads(data.threads);
        setCursor(data.pagination.cursor || null);
      } else {
        // Merge and deduplicate threads
        setThreads((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newThreads = data.threads.filter((t: Thread) => !existingIds.has(t.id));
          return [...prev, ...newThreads];
        });
        setCursor(data.pagination.cursor || null);
      }

      setHasMore(data.pagination.has_more || false);
    } catch (error) {
      console.error("Failed to load threads:", error);
      if (reset) {
        toast.error("Failed to load threads");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, cursor, loading, loadingMore]);

  // Load thread detail with caching
  const loadThreadDetail = useCallback(async (threadId: string) => {
    // Check cache first
    const cachedThread = inboxCache.getThread(threadId);
    const cachedMessages = inboxCache.getMessages(threadId);
    
    if (cachedThread && cachedMessages) {
      // Use cached data immediately for instant load
      setThreadDetail({
        thread: {
          id: cachedThread.id,
          pinned: cachedThread.pinned || false,
          latest_intent: cachedThread.latest_intent || "UNCLASSIFIED",
          status: cachedThread.status || "open",
          unread_count: cachedThread.unread_count || 0,
        },
        lead: cachedThread.lead,
        campaign: cachedThread.campaign,
        messages: cachedMessages,
        notes: [],
        tasks: [],
      });
      setSelectedThreadId(threadId);
      
      // Refresh in background
      try {
        const res = await fetch(`/api/inbox/v2/threads/${threadId}`);
        if (res.ok) {
          const data = await res.json();
          inboxCache.setThread(data.thread);
          inboxCache.setMessages(threadId, data.messages);
          setThreadDetail(data);
        }
      } catch (error) {
        console.error("Background refresh failed:", error);
      }
      return;
    }
    
    try {
      const res = await fetch(`/api/inbox/v2/threads/${threadId}`);
      if (!res.ok) throw new Error("Failed to load thread detail");

      const data = await res.json();
      
      // Cache the results
      inboxCache.setThread(data.thread);
      inboxCache.setMessages(threadId, data.messages);
      
      setThreadDetail(data);
      setSelectedThreadId(threadId);

      // Mark thread as read when opened
      if (data.thread.unread_count > 0) {
        try {
          await fetch("/api/inbox/v2/mark-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ thread_ids: [threadId] }),
          });
          // Update local state
          setThreads((prev) =>
            prev.map((t) =>
              t.id === threadId ? { ...t, unread_count: 0 } : t
            )
          );
        } catch (error) {
          console.error("Failed to mark as read:", error);
        }
      }
    } catch (error) {
      console.error("Failed to load thread detail:", error);
      toast.error("Failed to load thread");
    }
  }, []);

  // Pin/unpin thread
  const handlePinThread = useCallback(async (threadId: string, pinned: boolean) => {
    try {
      const res = await fetch("/api/inbox/v2/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, pinned }),
      });

      if (!res.ok) throw new Error("Failed to pin thread");

      // Update local state
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, pinned } : t))
      );
      if (threadDetail?.thread.id === threadId) {
        setThreadDetail({
          ...threadDetail,
          thread: { ...threadDetail.thread, pinned },
        });
      }
    } catch (error) {
      console.error("Failed to pin thread:", error);
      toast.error("Failed to pin thread");
    }
  }, [threadDetail]);

  // Send reply
  const handleSendReply = useCallback(
    async (subject: string, body: string) => {
      if (!selectedThreadId) return;

      try {
        const res = await fetch("/api/inbox/v2/send-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: selectedThreadId,
            subject,
            body_text: body,
            body_html: body.replace(/\n/g, "<br/>"),
            to_email: threadDetail?.lead.email,
          }),
        });

        if (!res.ok) throw new Error("Failed to send reply");

        toast.success("Reply sent");
        
        // Reload thread detail
        await loadThreadDetail(selectedThreadId);
        await loadThreads(true);
      } catch (error) {
        console.error("Failed to send reply:", error);
        toast.error("Failed to send reply");
      }
    },
    [selectedThreadId, threadDetail, loadThreadDetail, loadThreads]
  );

  // Add note
  const handleAddNote = useCallback(async (body: string) => {
    if (!threadDetail || !threadDetail.lead.id) return;

    try {
      const res = await fetch("/api/inbox/v2/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: threadDetail.lead.id,
          body,
          campaign_id: threadDetail.campaign?.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to add note");

      toast.success("Note added");
      await loadThreadDetail(threadDetail.thread.id);
    } catch (error) {
      console.error("Failed to add note:", error);
      toast.error("Failed to add note");
    }
  }, [threadDetail, loadThreadDetail]);

  // Update status
  const handleUpdateStatus = useCallback(
    async (status: string) => {
      if (!threadDetail) return;

      try {
        const res = await fetch("/api/inbox/v2/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_ids: [threadDetail.thread.id],
            action: "update_intent",
            value: status,
          }),
        });

        if (!res.ok) throw new Error("Failed to update status");

        toast.success("Status updated");
        await loadThreadDetail(threadDetail.thread.id);
        await loadThreads(true);
      } catch (error) {
        console.error("Failed to update status:", error);
        toast.error("Failed to update status");
      }
    },
    [threadDetail, loadThreadDetail, loadThreads]
  );

  // Bulk actions
  const handleBulkAction = useCallback(
    async (action: string, value?: string) => {
      if (selectedIds.size === 0) return;

      try {
        const res = await fetch("/api/inbox/v2/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_ids: Array.from(selectedIds),
            action,
            value,
          }),
        });

        if (!res.ok) throw new Error("Failed to perform bulk action");

        toast.success(`Bulk action completed`);
        await loadThreads(true);
        setSelectedIds(new Set());
      } catch (error) {
        console.error("Bulk action failed:", error);
        toast.error("Failed to perform bulk action");
      }
    },
    [selectedIds, loadThreads]
  );

  // Initial load
  useEffect(() => {
    loadThreads(true);
  }, [filter]);

  // Auto-select first thread
  useEffect(() => {
    if (threads.length > 0 && !selectedThreadId) {
      loadThreadDetail(threads[0].id);
    }
  }, [threads, selectedThreadId, loadThreadDetail]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && cursor) {
      loadThreads(false, cursor);
    }
  }, [loadingMore, hasMore, cursor, loadThreads]);

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Left: Lead List */}
      <div className="w-80 flex-shrink-0 flex flex-col">
        <LeadList
          threads={threads}
          selectedThreadId={selectedThreadId}
          onSelectThread={loadThreadDetail}
          onPinThread={handlePinThread}
          filter={filter}
          onFilterChange={(f) => {
            setFilter(f);
            setCursor(null);
            setHasMore(true);
          }}
          selectedIds={selectedIds}
          onToggleSelect={(id) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) {
                next.delete(id);
              } else {
                next.add(id);
              }
              return next;
            });
          }}
          onClearSelection={() => setSelectedIds(new Set())}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
        />
        {selectedIds.size > 0 && (
          <BulkControls
            selectedIds={selectedIds}
            onBulkAction={handleBulkAction}
            onClearSelection={() => setSelectedIds(new Set())}
          />
        )}
      </div>

      {/* Center: Thread View */}
      <div className="flex-1 flex flex-col border-r min-w-0">
        {threadDetail ? (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">
                  {threadDetail.lead.name}
                </h2>
                <p className="text-sm text-gray-600">
                  {threadDetail.lead.email}
                </p>
              </div>
              {threadDetail.thread.latest_intent && (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                  {threadDetail.thread.latest_intent}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!threadDetail ? (
                <MessageListSkeleton count={3} />
              ) : threadDetail.messages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  No messages yet
                </div>
              ) : (
                threadDetail.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              )}
            </div>

            {/* Composer */}
            <ComposerV2
              onSend={handleSendReply}
              disabled={!threadDetail}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a thread to view messages
          </div>
        )}
      </div>

      {/* Right: Lead Info Panel & Tasks */}
      <div className="w-80 flex-shrink-0 flex">
        <LeadInfoPanel
          lead={threadDetail?.lead || null}
          campaign={threadDetail?.campaign || null}
          notes={threadDetail?.notes || []}
          tasks={threadDetail?.tasks || []}
          onAddNote={handleAddNote}
          onUpdateStatus={handleUpdateStatus}
        />
        <TaskSidebar
          threadId={selectedThreadId || undefined}
          leadId={threadDetail?.lead?.id}
          contactId={threadDetail?.lead?.id}
        />
      </div>
    </div>
  );
}

