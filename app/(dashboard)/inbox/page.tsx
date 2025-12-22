// app/(dashboard)/inbox/page.tsx
// Block 8790 — Inbox v1: Unified Roofing Reply Center
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLeadDrawer } from "@/contexts/LeadDrawerContext";
import { LeadDrawerWrapper } from "@/components/leads/LeadDrawerWrapper";
import AIReplyButton, { AIReplyComposer } from "@/components/inbox/AIReplyButton";

type Thread = {
  lead_id: string;
  lead: { id: string; name: string | null; email: string };
  last_message: string | null;
  last_at: string;
  classification: string | null;
};

type Message = {
  id: string;
  body_text: string;
  created_at: string;
  direction: "in" | "out";
  classification?: string;
};

function InboxPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const selectedLead = params.get("lead");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingClassification, setUpdatingClassification] = useState<string | null>(null);
  const [aiReply, setAiReply] = useState<{ reply: string; type: string } | null>(null);

  const { openLead } = useLeadDrawer();

  useEffect(() => {
    async function loadThreads() {
      setLoadingThreads(true);
      try {
        const res = await fetch("/api/inbox", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    if (!selectedLead) {
      setMessages([]);
      setLoadingThread(false);
      return;
    }

    async function loadThread() {
      setLoadingThread(true);
      try {
        const res = await fetch(`/api/inbox/${selectedLead}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Thread load error:", err);
      } finally {
        setLoadingThread(false);
      }
    }
    loadThread();
  }, [selectedLead]);

  async function handleSendReply(messageToSend?: string) {
    const message = messageToSend || replyText;
    if (!selectedLead || !message.trim()) return;

    const thread = threads.find((t) => t.lead_id === selectedLead);
    if (!thread) return;

    setSendingReply(true);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: selectedLead,
          to_email: thread.lead.email,
          message: message,
        }),
      });

      if (res.ok) {
        setReplyText("");
        setAiReply(null); // Clear AI reply after sending
        // Reload thread to show new message
        const threadRes = await fetch(`/api/inbox/${selectedLead}`, { cache: "no-store" });
        if (threadRes.ok) {
          const data = await threadRes.json();
          setMessages(data.messages || []);
        }
        // Reload threads list to update last message
        const threadsRes = await fetch("/api/inbox", { cache: "no-store" });
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

  function handleAIReplyGenerated(reply: string, replyType: string) {
    setAiReply({ reply, type: replyType });
    setReplyText(reply); // Also populate the textarea
  }

  function handleAIEdit(editedReply: string) {
    setReplyText(editedReply);
    if (aiReply) {
      setAiReply({ ...aiReply, reply: editedReply });
    }
  }

  async function handleClassify(classification: string) {
    if (!selectedLead) return;

    setUpdatingClassification(classification);
    try {
      const res = await fetch(`/api/leads/${selectedLead}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification }),
      });

      if (res.ok) {
        // Update local state
        setThreads((prev) =>
          prev.map((t) =>
            t.lead_id === selectedLead ? { ...t, classification } : t
          )
        );
      } else {
        const error = await res.json();
        alert(error.error || "Failed to update classification");
      }
    } catch (err) {
      console.error("Classification error:", err);
      alert("Failed to update classification");
    } finally {
      setUpdatingClassification(null);
    }
  }

  const selectedThread = threads.find((t) => t.lead_id === selectedLead);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-80 border-r border-neutral-800 bg-neutral-950/90 p-3 text-xs">
        <div className="mb-3 text-[0.7rem] uppercase tracking-wide text-neutral-500">
          Inbox
        </div>

        {loadingThreads ? (
          <div className="text-neutral-400">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="text-neutral-400 text-xs">
            No conversations yet. Replies from homeowners will appear here.
          </div>
        ) : (
          <div className="space-y-1 overflow-y-auto">
            {threads.map((t) => (
              <Link
                key={t.lead_id}
                href={`/inbox?lead=${t.lead_id}`}
                className={`block rounded-xl px-3 py-2 ${
                  t.lead_id === selectedLead
                    ? "bg-neutral-900 border border-neutral-700"
                    : "hover:bg-neutral-900/60"
                }`}
              >
                <div className="font-semibold text-neutral-100">
                  {t.lead.name || t.lead.email}
                </div>
                {t.classification && (
                  <div className="text-[0.65rem] text-emerald-400 mt-0.5">
                    {t.classification}
                  </div>
                )}
                <div className="text-[0.65rem] text-neutral-400 truncate mt-1">
                  {t.last_message}
                </div>
                <div className="text-[0.6rem] text-neutral-500 mt-1">
                  {new Date(t.last_at).toLocaleString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </aside>

      {/* Thread Panel */}
      <main className="flex flex-1 flex-col bg-neutral-950 p-6 text-xs">
        {!selectedLead ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            Select a conversation
          </div>
        ) : loadingThread ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            Loading thread…
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-100">
                  {selectedThread?.lead.name || selectedThread?.lead.email || "Conversation"}
                </div>
                <button
                  className="text-[0.7rem] text-emerald-400 underline mt-1"
                  onClick={() => openLead(selectedLead)}
                >
                  View lead details
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleClassify("hot")}
                  disabled={updatingClassification === "hot"}
                  className={`rounded-lg px-2 py-1 text-[0.7rem] ${
                    selectedThread?.classification === "hot"
                      ? "bg-emerald-500/30 text-emerald-300"
                      : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                  } disabled:opacity-50`}
                >
                  {updatingClassification === "hot" ? "..." : "Mark Hot"}
                </button>
                <button
                  onClick={() => handleClassify("warm")}
                  disabled={updatingClassification === "warm"}
                  className={`rounded-lg px-2 py-1 text-[0.7rem] ${
                    selectedThread?.classification === "warm"
                      ? "bg-amber-500/30 text-amber-300"
                      : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                  } disabled:opacity-50`}
                >
                  {updatingClassification === "warm" ? "..." : "Mark Warm"}
                </button>
                <button
                  onClick={() => handleClassify("not_interested")}
                  disabled={updatingClassification === "not_interested"}
                  className={`rounded-lg px-2 py-1 text-[0.7rem] ${
                    selectedThread?.classification === "not_interested"
                      ? "bg-red-500/30 text-red-300"
                      : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  } disabled:opacity-50`}
                >
                  {updatingClassification === "not_interested" ? "..." : "Not Interested"}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto mb-4">
              {messages.length === 0 ? (
                <div className="text-neutral-400 text-center py-8">
                  No messages yet
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl p-3 max-w-[80%] ${
                      m.direction === "in"
                        ? "bg-neutral-900 border border-neutral-700"
                        : "bg-neutral-800/80 ml-auto"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-neutral-100">
                      {m.body_text}
                    </div>
                    <div className="mt-1 text-[0.65rem] text-neutral-500">
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Reply input */}
            <div className="border-t border-neutral-800 pt-4 space-y-3">
              {/* AI Reply Composer (if AI reply was generated) */}
              {aiReply && (
                <AIReplyComposer
                  generatedReply={aiReply.reply}
                  replyType={aiReply.type}
                  onSend={(reply) => handleSendReply(reply)}
                  onEdit={handleAIEdit}
                  onCancel={() => {
                    setAiReply(null);
                    setReplyText("");
                  }}
                  sending={sendingReply}
                />
              )}

              {/* AI Reply Button */}
              {!aiReply && (
                <div className="flex items-center gap-2 mb-2">
                  <AIReplyButton
                    leadId={selectedLead}
                    onReplyGenerated={handleAIReplyGenerated}
                    disabled={sendingReply}
                  />
                </div>
              )}

              {/* Manual Reply Input */}
              <textarea
                rows={3}
                placeholder="Type your reply…"
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value);
                  if (aiReply && e.target.value !== aiReply.reply) {
                    // Clear AI reply if user manually edits
                    setAiReply(null);
                  }
                }}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => handleSendReply()}
                disabled={!replyText.trim() || sendingReply}
                className="rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingReply ? "Sending..." : "Send Reply"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function InboxPage() {
  return (
    <LeadDrawerWrapper>
      <InboxPageContent />
    </LeadDrawerWrapper>
  );
}
