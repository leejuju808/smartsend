"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

interface RepliesThreadProps {
  message: {
    id: string;
    subject: string;
    from_email: string;
    body: string;
    created_at: string;
  } | null;
  onClose: () => void;
}

export default function RepliesThread({ message, onClose }: RepliesThreadProps) {
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  if (!message) return null;

  const handleReply = async () => {
    if (!reply.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: message.id,
          body: reply,
          to: message.from_email,
        }),
      });
      if (!res.ok) throw new Error("Reply failed");
      setReply("");
      alert("Reply sent ✅");
    } catch (err) {
      console.error(err);
      alert("Error sending reply ❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full border-l bg-background p-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">{message.subject}</h2>
        <button onClick={onClose} className="text-sm text-muted-foreground">Close</button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        From: {message.from_email} — {new Date(message.created_at).toLocaleString()}
      </p>

      <div className="flex-1 overflow-y-auto rounded-md border p-3 whitespace-pre-wrap">
        {message.body}
      </div>

      <div className="mt-4 border-t pt-3">
        <Textarea
          placeholder="Write your reply..."
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
        />
        <Button onClick={handleReply} className="mt-2" disabled={loading}>
          {loading ? "Sending..." : "Send Reply"}
        </Button>
      </div>
    </div>
  );
}

