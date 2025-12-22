"use client";

import { useState } from "react";
import { useRewriter } from "@/hooks/useRewriter";

export default function ReplyBox({
  threadId,
  fromEmail,
  toEmail,
  onSent,
}: {
  threadId: string;
  fromEmail: string;
  toEmail: string;
  onSent?: () => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const { rewrite, loading: rewriting } = useRewriter();

  const handleSlashCommand = async (text: string) => {
    const match = text.match(/^\/rewrite:\s*(\w+)/);
    const mode = match?.[1];
    if (!mode) return false;

    // Extract text after the command (can be on same line or next lines)
    const lines = text.split('\n');
    const firstLine = lines[0] || '';
    const commandMatch = firstLine.match(/^\/rewrite:\s*(\w+)\s*(.*)/);
    
    if (!commandMatch) return false;
    
    // Get text after the command on first line, plus any following lines
    const textAfterCommand = commandMatch[2] || '';
    const remainingLines = lines.slice(1);
    const textToRewrite = (textAfterCommand + '\n' + remainingLines.join('\n')).trim();
    
    if (!textToRewrite) return false;

    try {
      const newText = await rewrite(textToRewrite, mode);
      setValue(newText);
      return true;
    } catch (error: any) {
      console.error("Error rewriting:", error);
      alert(error.message || "Failed to rewrite");
      return false;
    }
  };

  const send = async () => {
    if (!value.trim()) return;
    
    // Check for slash command before sending
    if (value.trim().startsWith("/rewrite:")) {
      const handled = await handleSlashCommand(value);
      if (handled) return; // Don't send if it was a rewrite command
    }

    setSending(true);
    const res = await fetch("/api/replies-new/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        fromEmail,
        toEmail,
        bodyText: value,
      }),
      headers: { "Content-Type": "application/json" },
    });
    setSending(false);
    if (res.ok) {
      setValue("");
      onSent?.();
    } else {
      const j = await res.json();
      alert(j.error || "Failed to send");
    }
  };

  return (
    <div className="border rounded-2xl p-3 shadow-sm bg-background">
      <textarea
        className="w-full resize-none min-h-[100px] outline-none bg-transparent"
        placeholder="Write your reply… (use /rewrite: warmer, /rewrite: shorter, /rewrite: formal, or /rewrite: summarize)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && e.metaKey) {
            e.preventDefault();
            await send();
          } else if (e.key === "Enter" && e.shiftKey && value.trim().startsWith("/rewrite:")) {
            e.preventDefault();
            await handleSlashCommand(value);
          }
        }}
        disabled={rewriting}
      />
      <div className="flex items-center justify-between mt-2">
        <div className="text-xs text-muted-foreground">
          From: {fromEmail} → {toEmail}
          {rewriting && <span className="ml-2 text-blue-500">Rewriting...</span>}
        </div>
        <button
          onClick={send}
          disabled={sending || rewriting}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

