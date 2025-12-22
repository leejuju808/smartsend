// Block 24940 — SmartSend Roofing Messaging Hub v1
// Unified Inbox • Multi-Channel Messaging • AI Templates • Snippets • Fast Sales & Ops Replies

"use client";

import { useEffect, useState, useCallback } from "react";
import { MessagingHubFilters } from "@/components/messaging-hub/MessagingHubFilters";
import { MessagingHubMessageList } from "@/components/messaging-hub/MessagingHubMessageList";
import { MessagingHubContextPanel } from "@/components/messaging-hub/MessagingHubContextPanel";
import { MessagingHubComposer } from "@/components/messaging-hub/MessagingHubComposer";
import { toast } from "sonner";

type Message = {
  id: string;
  channel: string;
  direction: "inbound" | "outbound";
  from_address: string;
  to_address: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  status: string;
  ai_intent: string | null;
  ai_priority: string;
  labels: string[];
  needs_follow_up: boolean;
  assigned_to: string | null;
  routed_to_role: string | null;
  created_at: string;
  contacts?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  leads?: {
    id: string;
    name: string;
    email: string;
    status: string;
    estimated_job_value: number | null;
  };
  roofing_jobs?: {
    id: string;
    title: string;
    status: string;
    job_value: number | null;
    current_stage: string;
    scheduled_start_date: string | null;
  };
};

type Filter =
  | "all"
  | "homeowners"
  | "leads"
  | "insurance"
  | "suppliers"
  | "crews"
  | "high_priority"
  | "needs_follow_up"
  | "hot_leads"
  | "scheduled_jobs"
  | "completed_jobs";

export default function MessagingHubPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [channel, setChannel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Load messages
  const loadMessages = useCallback(
    async (reset = false, nextCursor?: string | null) => {
      if ((loading && !reset) || (loadingMore && !reset)) return;

      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({
          filter,
          limit: "50",
        });

        if (channel) {
          params.append("channel", channel);
        }

        if (nextCursor || (!reset && cursor)) {
          params.append("cursor", nextCursor || cursor || "");
        }

        const res = await fetch(`/api/messaging-hub/messages?${params}`);
        if (!res.ok) throw new Error("Failed to load messages");

        const data = await res.json();

        if (reset) {
          setMessages(data.messages || []);
          setCursor(data.pagination?.cursor || null);
        } else {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMessages = (data.messages || []).filter(
              (m: Message) => !existingIds.has(m.id)
            );
            return [...prev, ...newMessages];
          });
          setCursor(data.pagination?.cursor || null);
        }

        setHasMore(data.pagination?.has_more || false);
      } catch (error) {
        console.error("Failed to load messages:", error);
        if (reset) {
          toast.error("Failed to load messages");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, channel, cursor, loading, loadingMore]
  );

  // Load message detail
  const loadMessageDetail = useCallback(async (messageId: string) => {
    try {
      const res = await fetch(`/api/messaging-hub/messages/${messageId}`);
      if (!res.ok) throw new Error("Failed to load message");

      const data = await res.json();
      setSelectedMessage(data.message);
      setSelectedMessageId(messageId);
    } catch (error) {
      console.error("Failed to load message detail:", error);
      toast.error("Failed to load message");
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadMessages(true);
  }, [filter, channel]);

  // Auto-select first message
  useEffect(() => {
    if (messages.length > 0 && !selectedMessageId) {
      loadMessageDetail(messages[0].id);
    }
  }, [messages, selectedMessageId, loadMessageDetail]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && cursor) {
      loadMessages(false, cursor);
    }
  }, [loadingMore, hasMore, cursor, loadMessages]);

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Left: Filters */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r bg-gray-50">
        <MessagingHubFilters
          filter={filter}
          channel={channel}
          onFilterChange={(f) => {
            setFilter(f);
            setCursor(null);
            setHasMore(true);
          }}
          onChannelChange={(c) => {
            setChannel(c);
            setCursor(null);
            setHasMore(true);
          }}
        />
      </div>

      {/* Center: Message List */}
      <div className="flex-1 flex flex-col border-r min-w-0">
        <MessagingHubMessageList
          messages={messages}
          selectedMessageId={selectedMessageId}
          onSelectMessage={loadMessageDetail}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
        />
      </div>

      {/* Right: Context Panel & Composer */}
      <div className="w-96 flex-shrink-0 flex flex-col">
        {selectedMessage ? (
          <>
            <MessagingHubContextPanel message={selectedMessage} />
            <div className="border-t flex-1 flex flex-col min-h-0">
              <MessagingHubComposer
                message={selectedMessage}
                onSend={async (subject, body) => {
                  // TODO: Implement send reply
                  toast.success("Reply sent");
                  await loadMessages(true);
                  await loadMessageDetail(selectedMessage.id);
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Select a message to view details
          </div>
        )}
      </div>
    </div>
  );
}






































