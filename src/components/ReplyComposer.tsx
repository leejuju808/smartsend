"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { sendReply } from "@/lib/actions/replies";

type Props = {
  threadId?: string;
  toEmail: string;
  subject: string;
  onSent?: () => void;
  onSending?: (v: boolean) => void;
  disabled?: boolean;
};

export default function ReplyComposer({
  threadId,
  toEmail,
  subject,
  onSent,
  onSending,
  disabled,
}: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const doSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    onSending?.(true);
    try {
      await sendReply({ threadId, toEmail, subject, body });
      setBody("");
      onSent?.();
    } catch (e) {
      console.error(e);
      alert("Send failed. Check server logs.");
    } finally {
      setSending(false);
      onSending?.(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write your reply… (Enter to send, Shift+Enter for newline)"
        className="min-h-[140px]"
        disabled={disabled || sending}
      />
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Sending to <span className="font-medium">{toEmail}</span>
        </div>
        <Button onClick={doSend} disabled={disabled || sending}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

