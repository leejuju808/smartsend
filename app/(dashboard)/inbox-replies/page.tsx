// app/(dashboard)/inbox-replies/page.tsx
// Block 10900 — SmartSend Roofing Reply Inbox v1
// The Contractor-Proof Inbox That Shows Only Money Replies

"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

type IntentFilter = "hot" | "warm" | "follow_up" | "not_interested" | "all";

type Thread = {
  thread_id: string;
  lead_id: string;
  lead: {
    id: string;
    email: string;
    name: string;
  };
  snippet: string;
  intent: string;
  status: string;
  last_at: string;
  unread_count: number;
  campaign_id?: string;
  campaign_name?: string;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  snippet?: string;
  sent_at: string;
  created_at: string;
};

export default function ReplyInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedThreadId = searchParams.get("thread");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [combinedFilter, setCombinedFilter] = useState(true); // Default: HOT + WARM

  const [replyText, setReplyText] = useState("");
  const [suggestedReply, setSuggestedReply] = useState("");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingLabel, setUpdatingLabel] = useState<string | null>(null);

  // Load threads
  useEffect(() => {
    async function loadThreads() {
      setLoadingThreads(true);
      try {
        const filterParam = combinedFilter ? "hot,warm" : intentFilter;
        const url = combinedFilter
          ? `/api/inbox?combined=${filterParam}`
          : `/api/inbox?intent=${intentFilter}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setThreads(data);
        }
      } catch (err) {
        console.error("Inbox load error:", err);
      } finally {
        setLoadingThreads(false);
      }
    }
    loadThreads();
  }, [intentFilter, combinedFilter]);

  // Load selected thread messages
  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null);
      setMessages([]);
      return;
    }

    async function loadThread() {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/inbox/replies/${selectedThreadId}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          // Find thread in list
          const thread = threads.find((t) => t.thread_id === selectedThreadId);
          if (thread) {
            setSelectedThread(thread);
          }
        }
      } catch (err) {
        console.error("Thread load error:", err);
      } finally {
        setLoadingMessages(false);
      }
    }
    loadThread();
  }, [selectedThreadId, threads]);

  // Generate suggested reply when thread is selected
  useEffect(() => {
    if (selectedThreadId && messages.length > 0) {
      const lastInbound = messages
        .filter((m) => m.direction === "inbound")
        .slice(-1)[0];
      if (lastInbound) {
        generateSuggestedReply();
      }
    }
  }, [selectedThreadId, messages]);

  async function generateSuggestedReply() {
    if (!selectedThreadId) return;
    setLoadingSuggestion(true);
    try {
      const res = await fetch("/api/inbox/reply/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: selectedThreadId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedReply(data.suggested_reply || "");
      }
    } catch (err) {
      console.error("Suggestion error:", err);
    } finally {
      setLoadingSuggestion(false);
    }
  }

  async function handleSendReply() {
    if (!selectedThread || !replyText.trim()) return;

    setSendingReply(true);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: selectedThread.thread_id,
          message: replyText,
        }),
      });

      if (res.ok) {
        setReplyText("");
        setSuggestedReply("");
        // Reload messages
        const threadRes = await fetch(
          `/api/inbox/replies/${selectedThread.thread_id}`,
          { cache: "no-store" }
        );
        if (threadRes.ok) {
          const data = await threadRes.json();
          setMessages(data.messages || []);
        }
        // Reload threads
        const filterParam = combinedFilter ? "hot,warm" : intentFilter;
        const url = combinedFilter
          ? `/api/inbox?combined=${filterParam}`
          : `/api/inbox?intent=${intentFilter}`;
        const threadsRes = await fetch(url, { cache: "no-store" });
        if (threadsRes.ok) {
          const data = await threadsRes.json();
          setThreads(data);
        }
      } else {
        const error = await res.json();
        alert(error.error || "Failed to send reply");
      }
    } catch (err) {
      console.error("Reply send error:", err);
      alert("Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleUpdateLabel(intent: string) {
    if (!selectedThread) return;

    setUpdatingLabel(intent);
    try {
      const res = await fetch("/api/inbox/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: selectedThread.thread_id,
          intent,
        }),
      });

      if (res.ok) {
        // Update local state
        setSelectedThread({ ...selectedThread, intent });
        setThreads((prev) =>
          prev.map((t) =>
            t.thread_id === selectedThread.thread_id
              ? { ...t, intent }
              : t
          )
        );
        // Reload threads to reflect changes
        const filterParam = combinedFilter ? "hot,warm" : intentFilter;
        const url = combinedFilter
          ? `/api/inbox?combined=${filterParam}`
          : `/api/inbox?intent=${intentFilter}`;
        const threadsRes = await fetch(url, { cache: "no-store" });
        if (threadsRes.ok) {
          const data = await threadsRes.json();
          setThreads(data);
        }
      } else {
        const error = await res.json();
        alert(error.error || "Failed to update label");
      }
    } catch (err) {
      console.error("Label update error:", err);
      alert("Failed to update label");
    } finally {
      setUpdatingLabel(null);
    }
  }

  function getIntentColor(intent: string) {
    switch (intent) {
      case "hot":
        return "bg-red-500/20 text-red-300 border-red-500/30";
      case "warm":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case "follow_up":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "not_interested":
        return "bg-gray-500/20 text-gray-300 border-gray-500/30";
      default:
        return "bg-neutral-500/20 text-neutral-300 border-neutral-500/30";
    }
  }

  function getIntentLabel(intent: string) {
    switch (intent) {
      case "hot":
        return "HOT";
      case "warm":
        return "WARM";
      case "follow_up":
        return "FOLLOW UP";
      case "not_interested":
        return "NOT INTERESTED";
      default:
        return "UNCLASSIFIED";
    }
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950">
      {/* Section 1: Lead Intent Filters (Top Row) */}
      <div className="border-b border-neutral-800 bg-neutral-900/50 p-4">
        <div className="flex gap-3">
          <button
            onClick={() => {
              setCombinedFilter(true);
              setIntentFilter("all");
            }}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              combinedFilter
                ? "bg-red-500/30 text-red-300 border-2 border-red-500/50"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border-2 border-transparent"
            }`}
          >
            HOT + WARM
          </button>
          <button
            onClick={() => {
              setCombinedFilter(false);
              setIntentFilter("hot");
            }}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              !combinedFilter && intentFilter === "hot"
                ? "bg-red-500/30 text-red-300 border-2 border-red-500/50"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border-2 border-transparent"
            }`}
          >
            HOT
          </button>
          <button
            onClick={() => {
              setCombinedFilter(false);
              setIntentFilter("warm");
            }}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              !combinedFilter && intentFilter === "warm"
                ? "bg-yellow-500/30 text-yellow-300 border-2 border-yellow-500/50"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border-2 border-transparent"
            }`}
          >
            WARM
          </button>
          <button
            onClick={() => {
              setCombinedFilter(false);
              setIntentFilter("follow_up");
            }}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              !combinedFilter && intentFilter === "follow_up"
                ? "bg-blue-500/30 text-blue-300 border-2 border-blue-500/50"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border-2 border-transparent"
            }`}
          >
            FOLLOW UP
          </button>
          <button
            onClick={() => {
              setCombinedFilter(false);
              setIntentFilter("not_interested");
            }}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              !combinedFilter && intentFilter === "not_interested"
                ? "bg-gray-500/30 text-gray-300 border-2 border-gray-500/50"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border-2 border-transparent"
            }`}
          >
            NOT INTERESTED
          </button>
          <button
            onClick={() => {
              setCombinedFilter(false);
              setIntentFilter("all");
            }}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
              !combinedFilter && intentFilter === "all"
                ? "bg-neutral-700 text-neutral-100 border-2 border-neutral-600"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border-2 border-transparent"
            }`}
          >
            ALL
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Section 2: Thread List (Left Column) */}
        <aside className="w-80 border-r border-neutral-800 bg-neutral-950/90 overflow-y-auto">
          <div className="p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
              Replies ({threads.length})
            </div>

            {loadingThreads ? (
              <div className="text-neutral-400 text-sm">Loading…</div>
            ) : threads.length === 0 ? (
              <div className="text-neutral-400 text-sm">
                No replies yet. Homeowner replies will appear here.
              </div>
            ) : (
              <div className="space-y-2">
                {threads.map((thread) => (
                  <button
                    key={thread.thread_id}
                    onClick={() =>
                      router.push(`/inbox-replies?thread=${thread.thread_id}`)
                    }
                    className={`w-full text-left rounded-xl p-3 transition-colors ${
                      selectedThreadId === thread.thread_id
                        ? "bg-neutral-900 border-2 border-neutral-700"
                        : "bg-neutral-900/50 hover:bg-neutral-900 border-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="font-semibold text-neutral-100 text-sm truncate flex-1">
                        {thread.lead.name || thread.lead.email || "Homeowner"}
                      </div>
                      {thread.unread_count > 0 && (
                        <div className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center ml-2">
                          {thread.unread_count}
                        </div>
                      )}
                    </div>
                    <div
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-1 ${getIntentColor(
                        thread.intent
                      )}`}
                    >
                      {getIntentLabel(thread.intent)}
                    </div>
                    <div className="text-xs text-neutral-400 truncate mt-1">
                      {thread.snippet || "No preview"}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {formatDistanceToNow(new Date(thread.last_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Section 3: Message Thread (Main Column) */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedThreadId ? (
            <div className="flex h-full items-center justify-center text-neutral-400">
              Select a conversation
            </div>
          ) : loadingMessages ? (
            <div className="flex h-full items-center justify-center text-neutral-400">
              Loading thread…
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="border-b border-neutral-800 p-4 bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-neutral-100">
                      {selectedThread?.lead.name ||
                        selectedThread?.lead.email ||
                        "Conversation"}
                    </div>
                    <div className="text-sm text-neutral-400 mt-1">
                      {selectedThread?.lead.email}
                    </div>
                  </div>
                  {selectedThread && (
                    <div
                      className={`px-3 py-1 rounded-lg text-sm font-medium ${getIntentColor(
                        selectedThread.intent
                      )}`}
                    >
                      {getIntentLabel(selectedThread.intent)}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-neutral-400 text-center py-8">
                    No messages yet
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-xl p-4 max-w-[80%] ${
                        message.direction === "inbound"
                          ? "bg-neutral-900 border border-neutral-700"
                          : "bg-blue-500/20 border border-blue-500/30 ml-auto"
                      }`}
                    >
                      <div className="whitespace-pre-wrap text-neutral-100 text-sm">
                        {message.body || message.snippet}
                      </div>
                      <div className="mt-2 text-xs text-neutral-500">
                        {formatDistanceToNow(new Date(message.sent_at || message.created_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Suggested Reply */}
              {suggestedReply && (
                <div className="border-t border-neutral-800 p-4 bg-neutral-900/30">
                  <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
                    Suggested Reply (Auto-Generated)
                  </div>
                  <div className="bg-neutral-800 rounded-lg p-3 mb-2">
                    <div className="text-sm text-neutral-200 whitespace-pre-wrap">
                      {suggestedReply}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setReplyText(suggestedReply);
                      setSuggestedReply("");
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Use This Reply
                  </button>
                </div>
              )}

              {/* Reply Input */}
              <div className="border-t border-neutral-800 p-4 bg-neutral-900/50">
                <textarea
                  rows={3}
                  placeholder="Type your reply…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={generateSuggestedReply}
                    disabled={loadingSuggestion}
                    className="text-xs text-neutral-400 hover:text-neutral-300 disabled:opacity-50"
                  >
                    {loadingSuggestion ? "Generating..." : "Generate Reply"}
                  </button>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sendingReply}
                    className="rounded-xl bg-blue-500 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingReply ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Section 4: Actions Panel (Right Side) */}
        {selectedThreadId && selectedThread && (
          <aside className="w-64 border-l border-neutral-800 bg-neutral-950/90 p-4 overflow-y-auto">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-4">
              Actions
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleUpdateLabel("hot")}
                disabled={updatingLabel === "hot"}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedThread.intent === "hot"
                    ? "bg-red-500/30 text-red-300 border border-red-500/50"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-transparent"
                } disabled:opacity-50`}
              >
                {updatingLabel === "hot" ? "..." : "Mark Hot"}
              </button>

              <button
                onClick={() => handleUpdateLabel("warm")}
                disabled={updatingLabel === "warm"}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedThread.intent === "warm"
                    ? "bg-yellow-500/30 text-yellow-300 border border-yellow-500/50"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-transparent"
                } disabled:opacity-50`}
              >
                {updatingLabel === "warm" ? "..." : "Mark Warm"}
              </button>

              <button
                onClick={() => handleUpdateLabel("follow_up")}
                disabled={updatingLabel === "follow_up"}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedThread.intent === "follow_up"
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-transparent"
                } disabled:opacity-50`}
              >
                {updatingLabel === "follow_up" ? "..." : "Mark Follow-Up"}
              </button>

              <button
                onClick={() => handleUpdateLabel("not_interested")}
                disabled={updatingLabel === "not_interested"}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedThread.intent === "not_interested"
                    ? "bg-gray-500/30 text-gray-300 border border-gray-500/50"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-transparent"
                } disabled:opacity-50`}
              >
                {updatingLabel === "not_interested" ? "..." : "Not Interested"}
              </button>

              <div className="border-t border-neutral-800 my-4"></div>

              <button
                className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              >
                Stop All Follow-Ups
              </button>

              <button
                className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              >
                Add to Suppression List
              </button>

              <button
                className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              >
                Add Internal Note
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}























































