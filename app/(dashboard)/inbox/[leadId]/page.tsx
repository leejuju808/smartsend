// app/(dashboard)/inbox/[leadId]/page.tsx
// Block 8630 — Unified Replies Inbox v1
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LeadOutcomePanel } from "@/app/(dashboard)/leads/LeadOutcomePanel";

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.leadId as string;

  const [thread, setThread] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadThread() {
    try {
      const res = await fetch(`/api/inbox/${threadId}`);
      const data = await res.json();
      setThread(data);
    } catch (err) {
      console.error("Thread load error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThread();
  }, [threadId]);

  async function sendReply() {
    if (!thread?.lead || !reply.trim()) return;

    setSending(true);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: thread.lead.id,
          to_email: thread.lead.email || thread.messages.inbound[0]?.from_email,
          message: reply,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to send reply");
        return;
      }

      setReply("");
      // Reload thread
      const reloadRes = await fetch(`/api/inbox/${threadId}`);
      setThread(await reloadRes.json());
    } catch (e) {
      console.error("Reply error:", e);
      alert("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-neutral-400">
        Loading…
      </div>
    );
  }

  if (!thread || !thread.lead) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-neutral-400">
        <div className="text-center">
          <p>Conversation not found</p>
          <Link href="/inbox" className="text-sm text-blue-400 hover:underline mt-2 inline-block">
            Back to Inbox
          </Link>
        </div>
      </div>
    );
  }

  const { lead, messages } = thread;

  // Combine and sort all messages by time
  const allMessages = [
    ...(messages.outbound || []).map((m: any) => ({
      ...m,
      type: "outbound",
      timestamp: m.sent_at,
    })),
    ...(messages.inbound || []).map((m: any) => ({
      ...m,
      type: "inbound",
      timestamp: m.received_at,
    })),
  ].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });

  return (
    <div className="flex h-full flex-col flex-1 border-l border-neutral-800 bg-neutral-950/90">
      <div className="border-b border-neutral-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/inbox"
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← Back
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-50">
              {lead.name || lead.first_name || lead.email || "Unknown"}
            </h2>
            <p className="text-xs text-neutral-400">{lead.email || messages.inbound[0]?.from_email}</p>
          </div>
          {/* Mini status pill */}
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-neutral-900 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-neutral-400">
              {lead.outcome === "won"
                ? "Won"
                : lead.outcome === "lost"
                ? "Lost"
                : "Open"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.length === 0 ? (
          <div className="text-center text-neutral-400 py-8">
            No messages in this conversation yet.
          </div>
        ) : (
          allMessages.map((m: any, i: number) => (
            <div
              key={`${m.type}-${i}`}
              className={`flex ${m.type === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-md rounded-xl px-3 py-2 ${
                  m.type === "outbound"
                    ? "bg-neutral-800 text-neutral-200"
                    : "border border-neutral-700 bg-neutral-900 text-neutral-100"
                }`}
              >
                <div className="text-xs text-neutral-500 mb-1">
                  {new Date(m.timestamp).toLocaleString()}
                </div>
                {m.subject && (
                  <div className="text-sm font-semibold mb-1">{m.subject}</div>
                )}
                <div className="mt-1 whitespace-pre-line text-sm">
                  {m.body_text || m.body || ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lead Outcome Panel */}
      <div className="border-t border-neutral-800 p-4">
        <LeadOutcomePanel
          leadId={lead.id}
          initialOutcome={lead.outcome || "open"}
          initialWonValue={lead.won_value}
          initialNotes={lead.notes}
          onSave={loadThread}
        />
      </div>

      <div className="border-t border-neutral-800 p-4 flex gap-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type your reply…"
          className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              sendReply();
            }
          }}
        />

        <button
          disabled={sending || !reply.trim()}
          onClick={sendReply}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-neutral-200 transition-colors"
        >
          {sending ? "Sending…" : "Reply"}
        </button>
      </div>
    </div>
  );
}
