"use client";

import { EmailMessage } from "@/lib/supabase/inbox-types";
import { useRef, useState, useEffect } from "react";

export default function MessagePane({
  messages,
  leadName,
  threadSubject,
  onSend,
  disabled,
  onMessageClick,
}: {
  messages: EmailMessage[];
  leadName: string;
  threadSubject: string;
  onSend: (body: string, subject?: string) => Promise<void>;
  disabled: boolean;
  onMessageClick?: (message: EmailMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await onSend(body, subject || undefined);
      setBody("");
      // keep subject sticky unless user changes it
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b pb-2 mb-2">
        <div className="text-lg font-semibold">{leadName}</div>
        <div className="text-xs opacity-70">{threadSubject}</div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto space-y-3 pr-1">
        {messages.map((m) => (
          <div
            key={m.id}
            onClick={() => onMessageClick?.(m)}
            className={
              [
                m.direction === "out"
                  ? "ml-16 bg-black/5 dark:bg-white/10 rounded-xl p-3"
                  : "mr-16 bg-white dark:bg-neutral-800 rounded-xl p-3 border",
                onMessageClick ? "cursor-pointer hover:opacity-80 transition-opacity" : "",
              ].join(" ")
            }
          >
            {m.subject ? (
              <div className="text-xs font-medium mb-1 opacity-80">{m.subject}</div>
            ) : null}
            <div className="whitespace-pre-wrap text-sm">{m.body_text}</div>
            <div className="text-[10px] opacity-60 mt-1">{new Date(m.sent_at).toLocaleString()}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t pt-2 mt-2">
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm mb-2"
          placeholder="Subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={disabled || sending}
        />
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm min-h-[90px]"
          placeholder="Write your reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled || sending}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSend}
            disabled={disabled || sending || !body.trim()}
            className="px-4 py-2 rounded-xl border font-medium"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

