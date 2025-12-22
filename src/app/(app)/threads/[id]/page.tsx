"use client";

import * as React from "react";

import { NudgeBanner } from "@/components/thread/NudgeBanner";
import { SmartFollowupPreview } from "@/components/thread/SmartFollowupPreview";
import { ReplyLabel } from "@/components/ReplyLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ComposerHeader } from "@/app/(inbox)/thread/[id]/ComposerHeader";
import { MacroSlashMenu } from "@/app/(inbox)/thread/[id]/MacroSlashMenu";

import { ComposerRewritePanel } from "./ComposerRewritePanel";

type ReplyIntent = "positive" | "neutral" | "oos" | "bounce" | "ooo" | "meeting_intent" | null;

export default function ThreadPage({ params }: { params: { id: string } }) {
  const threadId = params.id;
  const campaignId = ""; // TODO: provide real campaign id
  const leadId = ""; // TODO: provide real lead id
  const fromAccountId = ""; // TODO: provide real from account id

  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [label, setLabel] = React.useState<ReplyIntent>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [macroMenuOpen, setMacroMenuOpen] = React.useState(false);
  const macroEnabled = Boolean(campaignId);
  const [pausedUntil, setPausedUntil] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!macroEnabled && macroMenuOpen) {
      setMacroMenuOpen(false);
    }
  }, [macroEnabled, macroMenuOpen]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setLabel((data?.thread?.last_inbound_label ?? null) as ReplyIntent);
          setPausedUntil(data?.thread?.paused_until ?? null);
        }
      } catch {
        // ignore fetch errors; defaults stay as-is
      }
    })();
    return () => {
      active = false;
    };
  }, [threadId]);

  const sendNow = React.useCallback(async () => {
    if (sending) {
      return;
    }

    setSending(true);
    try {
      const response = await fetch(`/api/threads/${threadId}/approve-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content: body, send: true }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to send reply");
      }

      await fetch(`/api/threads/${threadId}/mark-replied`, { method: "POST" });

      toast.success("Reply sent");
      setBody("");
      setLabel((current) => current ?? "positive");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send reply";
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [body, subject, threadId, sending]);

  const insertMacroText = React.useCallback(
    (text: string) => {
      if (!text) return;
      setBody((current) => {
        const el = textareaRef.current;
        if (!el) {
          return current + text;
        }
        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? current.length;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const next = `${before}${text}${after}`;

        requestAnimationFrame(() => {
          el.focus();
          const cursor = start + text.length;
          el.selectionStart = cursor;
          el.selectionEnd = cursor;
        });

        return next;
      });
    },
    [setBody],
  );

  return (
    <div className="space-y-4 p-4">
      {(label || (pausedUntil && new Date(pausedUntil).getTime() > Date.now())) && (
        <div className="flex items-center gap-2">
          <ReplyLabel label={label} />
          {pausedUntil && new Date(pausedUntil).getTime() > Date.now() ? (
            <Badge variant="outline">
              Paused until {new Date(pausedUntil).toLocaleDateString()}
            </Badge>
          ) : null}
        </div>
      )}

      <NudgeBanner threadId={threadId} />
      <SmartFollowupPreview
        threadId={threadId}
        campaignId={campaignId}
        leadId={leadId}
        fromAccountId={fromAccountId}
      />

      <ComposerHeader threadId={threadId} label={label} onLabelChange={setLabel} />

      <div className="space-y-2 rounded-2xl border p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium opacity-70">Composer</div>
          <div className="flex items-center gap-2">
            <Button
              variant={macroMenuOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setMacroMenuOpen((value) => !value)}
              disabled={!macroEnabled}
            >
              Macros
            </Button>
            <ComposerRewritePanel
              threadId={threadId}
              onInsert={(nextSubject, nextBody) => {
                setSubject(nextSubject);
                setBody(nextBody);
              }}
            />
          </div>
        </div>

        <Input placeholder="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
        <div className="relative">
          {macroEnabled ? (
            <MacroSlashMenu
              campaignId={campaignId}
              threadId={threadId}
              onInsert={insertMacroText}
              open={macroMenuOpen}
              onOpenChange={setMacroMenuOpen}
            />
          ) : null}
          <Textarea
            ref={textareaRef}
            rows={8}
            placeholder="Type `/` for macros…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSubject("");
              setBody("");
            }}
            disabled={sending}
          >
            Clear
          </Button>
          <Button onClick={sendNow} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

