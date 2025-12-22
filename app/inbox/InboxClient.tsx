"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { markThreadHandled } from "./actions";

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface Thread {
  id: string;
  lead_id: string;
  campaign_id: string;
  last_message_at: string;
  status: "open" | "handled" | "archived";
  ai_summary: string | null;
  leads: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  campaigns: {
    name: string;
  } | null;
}

interface InboxClientProps {
  threads: Thread[];
  markThreadHandled: (threadId: string) => Promise<{ success: boolean }>;
}

export default function InboxClient({ threads, markThreadHandled }: InboxClientProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    threads.length > 0 ? threads[0].id : null
  );
  const [threadsState, setThreadsState] = useState(threads);
  const [loading, setLoading] = useState<string | null>(null);

  const selectedThread = threadsState.find((t) => t.id === selectedThreadId);

  const handleMarkHandled = async (threadId: string) => {
    setLoading(threadId);
    try {
      await markThreadHandled(threadId);
      setThreadsState((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, status: "handled" as const } : t))
      );
    } catch (error) {
      console.error("Failed to mark thread as handled:", error);
      alert("Failed to mark thread as handled");
    } finally {
      setLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      open: "bg-blue-100 text-blue-800",
      handled: "bg-gray-100 text-gray-800",
      archived: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${colors[status as keyof typeof colors] || colors.open}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Column - Thread List */}
      <div className="w-1/3 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold">Inbox</h1>
          <p className="text-sm text-gray-500 mt-1">
            {threadsState.filter((t) => t.status === "open").length} open threads
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {threadsState.map((thread) => {
            const lead = thread.leads;
            const campaign = thread.campaigns;
            const leadName = lead
              ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email
              : "Unknown Lead";

            return (
              <div
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                className={`p-4 cursor-pointer hover:bg-gray-50 ${
                  selectedThreadId === thread.id ? "bg-blue-50 border-l-4 border-blue-500" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm text-gray-900 truncate">{leadName}</p>
                      {getStatusBadge(thread.status)}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{lead?.email}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {thread.ai_summary || "No summary available"}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-xs text-gray-500">{campaign?.name || "Unknown Campaign"}</p>
                      <span className="text-xs text-gray-400">•</span>
                      <p className="text-xs text-gray-400">
                        {formatTimeAgo(thread.last_message_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {threadsState.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <p>No threads yet. Replies will appear here.</p>
          </div>
        )}
      </div>

      {/* Right Column - Thread Viewer */}
      <div className="flex-1 overflow-y-auto bg-white">
        {selectedThread ? (
          <ThreadViewer
            thread={selectedThread}
            onMarkHandled={handleMarkHandled}
            loading={loading === selectedThread.id}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Select a thread to view conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadViewer({
  thread,
  onMarkHandled,
  loading,
}: {
  thread: Thread;
  onMarkHandled: (threadId: string) => Promise<void>;
  loading: boolean;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // Fetch messages for this thread
  useEffect(() => {
    async function fetchMessages() {
      try {
        const response = await fetch(
          `/api/inbox/threads/${thread.id}/messages`
        );
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error("Failed to fetch messages:", error);
      } finally {
        setLoadingMessages(false);
      }
    }
    fetchMessages();
  }, [thread.id]);

  const lead = thread.leads;
  const campaign = thread.campaigns;
  const leadName = lead
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email
    : "Unknown Lead";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{leadName}</h2>
            <p className="text-sm text-gray-500 mt-1">{lead?.email}</p>
            <p className="text-xs text-gray-400 mt-1">{campaign?.name || "Unknown Campaign"}</p>
          </div>
          {thread.status === "open" && (
            <Button
              onClick={() => onMarkHandled(thread.id)}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? "Marking..." : "Mark as Handled"}
            </Button>
          )}
        </div>

        {/* AI Summary */}
        {thread.ai_summary && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs font-medium text-blue-900 mb-1">AI Summary</p>
            <p className="text-sm text-blue-800">{thread.ai_summary}</p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loadingMessages ? (
          <div className="text-center text-gray-500 py-8">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No messages yet</div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-2xl rounded-lg p-4 ${
                  message.direction === "outbound"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {message.subject && (
                  <p className={`font-semibold mb-2 ${message.direction === "outbound" ? "text-blue-50" : "text-gray-900"}`}>
                    {message.subject}
                  </p>
                )}
                <div
                  className={`text-sm ${message.direction === "outbound" ? "text-blue-50" : "text-gray-700"}`}
                  dangerouslySetInnerHTML={{ __html: message.body || "" }}
                />
                <div className="flex items-center justify-between mt-2">
                  <p className={`text-xs ${message.direction === "outbound" ? "text-blue-200" : "text-gray-500"}`}>
                    {formatTimeAgo(message.sent_at)}
                  </p>
                  {message.direction === "inbound" && message.intent_label && (
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      message.intent_label === "hot_lead"
                        ? "bg-red-100 text-red-700"
                        : message.intent_label === "warm_lead"
                        ? "bg-amber-100 text-amber-700"
                        : message.intent_label === "not_interested" ||
                          message.intent_label === "unsubscribe"
                        ? "bg-gray-100 text-gray-700"
                        : message.intent_label === "out_of_office"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-700"
                    }`}>
                      AI: {message.intent_label.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

