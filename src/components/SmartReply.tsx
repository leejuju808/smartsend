"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/input";

const INTENT_CHOICES = [
  { k: "meeting", label: "Meeting" },
  { k: "interested", label: "Interested" },
  { k: "question", label: "Answer Q" },
  { k: "referral", label: "Referral" },
  { k: "not_now", label: "Not Now" },
  { k: "unsubscribe", label: "Unsubscribe" },
];

interface SmartReplyProps {
  threadId: string;
  defaultIntent?: string | null;
  variables?: Record<string, string>;
  onInsert: (data: { subject: string; html: string }) => Promise<void> | void;
}

export function SmartReply({
  threadId,
  defaultIntent,
  variables,
  onInsert,
}: SmartReplyProps) {
  const [loading, setLoading] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [intent, setIntent] = useState(defaultIntent ?? "meeting");

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch("/api/ai/reply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          intent,
          variables: variables || {},
        }),
      });

      if (!r.ok) {
        const error = await r.json();
        alert(error?.error || "Failed to generate draft");
        return;
      }

      const data = await r.json();
      setSubject(data.subject);
      setDraftHtml(data.html);
    } catch (error) {
      console.error("Error generating draft:", error);
      alert("Failed to generate draft");
    } finally {
      setLoading(false);
    }
  }

  async function handleInsertAndSend() {
    if (!draftHtml || !subject) return;
    await onInsert({ subject, html: draftHtml });
    // Clear after sending
    setDraftHtml("");
    setSubject("");
  }

  return (
    <div className="border-t p-3 space-y-2 bg-white">
      <div className="flex gap-2 flex-wrap">
        {INTENT_CHOICES.map((c) => (
          <Button
            key={c.k}
            variant={intent === c.k ? "default" : "secondary"}
            onClick={() => setIntent(c.k)}
            className="rounded-2xl text-xs"
            size="sm"
          >
            {c.label}
          </Button>
        ))}
        <Button onClick={generate} disabled={loading} size="sm">
          {loading ? "Drafting…" : "Generate"}
        </Button>
      </div>

      {draftHtml && (
        <>
          <div className="text-sm text-zinc-500 mt-2">Subject</div>
          <Input
            className="w-full"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <div className="text-sm text-zinc-500 mt-2">Draft</div>
          <Textarea
            className="min-h-[160px]"
            value={draftHtml}
            onChange={(e) => setDraftHtml(e.target.value)}
          />

          <div className="flex gap-2 justify-end mt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDraftHtml("");
                setSubject("");
              }}
              size="sm"
            >
              Discard
            </Button>
            <Button onClick={handleInsertAndSend} size="sm">
              Insert & Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

