// app/(dashboard)/inbox/_components/quick-reply-sheet.tsx

"use client";

import * as React from "react";
import { X, Send, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export interface QuickReplyContext {
  replyId: string;
  leadEmail: string;
  leadName?: string | null;
  campaignName?: string | null;
  intent?: string | null;
  threadSummary?: string | null;
}

interface QuickReplySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: QuickReplyContext | null;
}

export function QuickReplySheet({
  open,
  onOpenChange,
  context,
}: QuickReplySheetProps) {
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  React.useEffect(() => {
    // reset when opening new reply
    if (open && context) {
      setSubject("");
      setBody("");
      setError(null);
    }
  }, [open, context?.replyId]);

  if (!context) return null;

  const handleSend = async () => {
    if (!body.trim()) {
      setError("Reply body cannot be empty.");
      return;
    }

    setError(null);
    setIsSending(true);

    try {
      const res = await fetch(
        `/api/replies/${context.replyId}/quick-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, body }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error || "Failed to queue reply.");
        return;
      }

      onOpenChange(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateAI = async () => {
    // optional AI helper: try to hit your generate-reply-draft API
    if (!context) return;

    setAiLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox/ai-reply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replyId: context.replyId,
          tone: "neutral",
          length: "short",
        }),
      });

      if (res.status === 402) {
        setBody(
          "Upgrade to SmartSend Pro to generate AI-powered reply drafts directly from your inbox."
        );
        return;
      }

      if (!res.ok) {
        setError("Failed to generate AI draft.");
        return;
      }

      const json = await res.json();
      if (json.subject) setSubject(json.subject);
      if (json.body) setBody(json.body);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="flex flex-row items-center justify-between px-6 py-4 border-b">
          <SheetTitle className="text-base font-semibold">
            Reply to {context.leadName || context.leadEmail}
          </SheetTitle>
          <button
            className="rounded-full p-1 hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <div className="flex-1 p-6 space-y-4 overflow-auto">
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>
                To:{" "}
                <span className="font-medium text-foreground">
                  {context.leadEmail}
                </span>
              </span>
              {context.campaignName && (
                <span className="truncate max-w-[180px] text-right">
                  Campaign:{" "}
                  <span className="font-medium text-foreground">
                    {context.campaignName}
                  </span>
                </span>
              )}
            </div>
            {context.intent && (
              <div className="flex items-center gap-2 mt-1">
                <span>Intent:</span>
                <Badge className="text-[10px] capitalize">
                  {context.intent}
                </Badge>
              </div>
            )}
            {context.threadSummary && (
              <p className="mt-2 text-[11px] leading-snug">
                <span className="font-semibold">Thread summary:</span>{" "}
                {context.threadSummary}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Subject (optional)
            </label>
            <Input
              placeholder="Re: your inquiry"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Message
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                onClick={handleGenerateAI}
                disabled={aiLoading}
                title="Generate AI draft"
              >
                <Sparkles className="h-3 w-3" />
              </Button>
            </div>
            <Textarea
              rows={8}
              placeholder="Type your reply..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive whitespace-pre-line">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={isSending}
            >
              {isSending ? "Queueing…" : "Send reply"}
              <Send className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}































































