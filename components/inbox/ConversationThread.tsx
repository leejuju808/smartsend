// Block 20140 — Conversation Thread View

"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  subject?: string | null;
  body: string;
  sent_at: string;
  automation_tag?: string | null;
};

interface ConversationThreadProps {
  conversationId: string;
  refreshTrigger?: number; // Increment this to trigger refresh
}

export function ConversationThread({
  conversationId,
  refreshTrigger,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadMessages() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ conversation_id: conversationId });
      const res = await fetch(`/api/inbox/messages?${params.toString()}`);
      const json = await res.json();
      setMessages(json.messages ?? []);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (conversationId) {
      loadMessages();
    }
  }, [conversationId, refreshTrigger]);

  useEffect(() => {
    // scroll to bottom when messages change
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  return (
    <div className="flex-1 border rounded-xl bg-gray-50 overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b bg-white flex items-center justify-between">
        <p className="text-xs text-gray-600">Conversation</p>
        {loading && (
          <span className="text-[10px] text-gray-400">Loading…</span>
        )}
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 space-y-2 text-sm">
        {messages.length === 0 && !loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            No messages yet
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} msg={m} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isInbound = msg.direction === "inbound";
  const automationLabel = getAutomationLabel(msg.automation_tag || null);

  const container =
    "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line";
  const inboundClasses = "bg-white border border-gray-200 text-gray-800";
  const outboundClasses = "bg-black text-white";

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div>
        {!isInbound && automationLabel && (
          <p className="mb-1 text-[10px] text-gray-500 text-right">
            {automationLabel}
          </p>
        )}
        <div
          className={`${container} ${
            isInbound ? inboundClasses : outboundClasses
          }`}
        >
          {msg.subject && (
            <p className="text-[11px] font-semibold mb-1 opacity-80">
              {msg.subject}
            </p>
          )}
          <p>{msg.body}</p>
        </div>
        <p className="mt-0.5 text-[10px] text-gray-400 text-right">
          {new Date(msg.sent_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function getAutomationLabel(tag: string | null): string | null {
  if (!tag) return null;
  if (tag === "guardrail_hold") return "Follow-up sent by SmartSend";
  if (tag === "followup_day2") return "Follow-up sent by SmartSend";
  if (tag === "followup_day4") return "Follow-up sent by SmartSend";
  if (tag === "followup_day7") return "Follow-up sent by SmartSend";
  // fallback for future tags
  return "Sent by SmartSend";
}

