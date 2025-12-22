"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Mail, Loader2, Copy } from "lucide-react";

type Props = {
  replyId: string;
  leadName?: string | null;
  leadEmail?: string | null;
};

export function MeetingReplyDialog({ replyId, leadName, leadEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meeting-intents/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply_id: replyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error("meeting draft error", json);
        setError(json.error || "Failed to generate draft");
        return;
      }
      setSubject(json.subject || "");
      setBody(json.body || "");
    } catch (err) {
      console.error("meeting draft exception", err);
      setError("Failed to generate draft");
    } finally {
      setLoading(false);
    }
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !subject && !body && !loading) {
      loadDraft();
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(
        `Subject: ${subject}\n\n${body}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[10px]"
        onClick={() => onOpenChange(true)}
      >
        <Mail className="h-3 w-3 mr-1" />
        Reply with AI
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg bg-slate-950 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Meeting reply draft
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              SmartSend drafted a reply based on the lead&apos;s message and
              your booking link. Edit as needed, then copy into your email
              client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2 text-[11px]">
            {leadName || leadEmail ? (
              <div className="text-[10px] text-muted-foreground">
                To:{" "}
                <span className="font-medium">
                  {leadName || leadEmail}
                </span>{" "}
                {leadEmail && ` <${leadEmail}>`}
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-xs font-medium">Subject</label>
              <Input
                className="h-8 text-[12px]"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Body</label>
              <Textarea
                className="min-h-[200px] text-[12px] font-mono"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-[10px] text-red-300">{error}</p>
            )}
            {loading && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating draft…
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              size="sm"
              className="h-8 px-3 text-[11px]"
              onClick={copyAll}
              disabled={loading}
            >
              <Copy className="h-3 w-3 mr-1" />
              {copied ? "Copied!" : "Copy subject + body"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

