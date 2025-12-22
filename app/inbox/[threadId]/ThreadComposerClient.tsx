"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CopilotBar,
  CopilotHandle,
  Action as CopilotAction,
} from "@/app/(inbox)/thread/[id]/CopilotBar";
import { AiSlashMenu } from "@/app/(inbox)/thread/[id]/AiSlashMenu";
import { MacroSlashMenu } from "@/app/(inbox)/thread/[id]/MacroSlashMenu";
import { CloseDraftButton } from "@/app/(inbox)/thread/[id]/CloseDraftButton";
import { ScheduleDraftButton } from "@/app/(inbox)/thread/[id]/ScheduleDraftButton";
import { ComposerHeader } from "@/app/(inbox)/thread/[id]/ComposerHeader";
import { PreflightBanner } from "@/app/(inbox)/thread/[id]/PreflightBanner";
import { OfferTimes } from "@/app/(inbox)/thread/[id]/OfferTimes";
import { ThreadAssist } from "@/app/(inbox)/thread/[id]/ThreadAssist";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

type ThreadComposerClientProps = {
  threadId: string;
  campaignId: string;
  leadId: string;
  accountId: string;
  fromEmail: string;
  toEmail: string;
  initialLabel?: "positive" | "neutral" | "question" | "negative" | "ooo" | null;
  calendarId?: string | null;
};

type DraftResponse = {
  id: string;
  subject: string | null;
  body: string | null;
  source_message_id?: string | null;
};

type PreflightResult = {
  severity: "ok" | "warn" | "fail";
  checks: Array<{ key: string; severity: string; ok: boolean; msg: string }>;
  failing?: string[];
};

export function ThreadComposerClient({
  threadId,
  campaignId,
  leadId,
  accountId,
  fromEmail,
  toEmail,
  initialLabel,
  calendarId,
}: ThreadComposerClientProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const copilotRef = React.useRef<CopilotHandle>(null);

  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [draftId, setDraftId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [label, setLabel] = React.useState<typeof initialLabel>(initialLabel ?? null);
  const [preflight, setPreflight] = React.useState<PreflightResult | null>(null);
  const [preflightBusy, setPreflightBusy] = React.useState(false);
  const [quietInfo, setQuietInfo] = React.useState<{ quiet: boolean; ispKey: string | null } | null>(
    null,
  );
  const [quietLoading, setQuietLoading] = React.useState(false);

  React.useEffect(() => {
    if (!accountId || !toEmail) {
      setQuietInfo(null);
      return;
    }

    let cancelled = false;
    setQuietLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/account/quiet/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, to_email: toEmail }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error ?? "quiet_check_failed");
        if (!cancelled) {
          setQuietInfo({ quiet: !!payload.quiet, ispKey: payload.isp_key ?? null });
        }
      } catch {
        if (!cancelled) {
          setQuietInfo(null);
        }
      } finally {
        if (!cancelled) {
          setQuietLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, toEmail]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draftRes = await fetch(`/api/thread/${threadId}/draft`, { cache: "no-store" });
        if (draftRes.ok) {
          const payload = await draftRes.json();
          const draft = (payload?.draft ?? null) as DraftResponse | null;
          if (draft && !cancelled) {
            setSubject(draft.subject ?? "");
            setBody(draft.body ?? "");
            setDraftId(draft.id ?? null);
          }
        }
      } catch {
        // ignore draft load failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const preflightPayload = React.useMemo(
    () => ({
      account_id: accountId,
      campaign_id: campaignId,
      message_id: draftId ?? undefined,
      from_email: fromEmail,
      to_email: toEmail,
      subject,
      text: body,
    }),
    [accountId, body, draftId, fromEmail, subject, toEmail],
  );

  const runPreflight = React.useCallback(async () => {
    setPreflightBusy(true);
    try {
      const res = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preflightPayload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Preflight failed");
      }
      const result = json as PreflightResult;
      setPreflight(result);
      return result;
    } catch (error) {
      setPreflight(null);
      throw error;
    } finally {
      setPreflightBusy(false);
    }
  }, [preflightPayload]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target !== textareaRef.current) return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const preview = el.value.slice(Math.max(0, start - 3), start).toLowerCase();
        if (preview.endsWith("/ai")) {
          setAiOpen(true);
        }
      }
      if (event.key === "Escape" && aiOpen) {
        setAiOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiOpen]);

  const saveDraft = React.useCallback(async () => {
    if (!body.trim()) {
      toast.info("Write something before saving.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        campaign_id: campaignId,
        lead_id: leadId,
        body,
      };
      const subjectTrimmed = subject.trim();
      if (subjectTrimmed) payload.subject = subjectTrimmed;

      const res = await fetch(`/api/thread/${threadId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = json?.error ?? "Failed to save draft.";
        throw new Error(error);
      }

      if (typeof json?.draft_id === "string") {
        setDraftId(json.draft_id);
      }
      toast.success("Draft saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [body, campaignId, leadId, subject, threadId]);

  const sendNow = React.useCallback(async () => {
    if (!body.trim()) {
      toast.info("Write something before sending.");
      return;
    }
    setSending(true);
    try {
      const latest = await runPreflight();
      if (latest?.severity === "fail") {
        const failing = (latest.failing ?? latest.checks.filter((c) => !c.ok).map((c) => c.key)).slice(0, 4);
        throw new Error(
          `Preflight failed — fix issues before sending${failing.length ? ` (${failing.join(", ")})` : ""}`,
        );
      }

      const payload: Record<string, unknown> = {
        campaign_id: campaignId,
        lead_id: leadId,
        body,
      };
      if (subject.trim()) payload.subject = subject.trim();
      if (draftId) payload.draft_id = draftId;

      const res = await fetch(`/api/thread/${threadId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = json?.message ?? json?.error ?? "Failed to queue send.";
        throw new Error(err);
      }
      toast.success("Reply queued.");
      setBody("");
      setSubject("");
      setDraftId(null);
      textareaRef.current?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send.";
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [body, campaignId, draftId, leadId, runPreflight, subject, threadId]);

  const runAi = React.useCallback(
    async (action: string, extra?: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const selectionStart = el.selectionStart ?? 0;
      const selectionEnd = el.selectionEnd ?? selectionStart;
      if (selectionStart === selectionEnd) {
        const triggerStart = Math.max(0, selectionStart - 3);
        if (el.value.slice(triggerStart, selectionStart).toLowerCase() === "/ai") {
          const before = body.slice(0, triggerStart);
          const after = body.slice(selectionEnd);
          const next = `${before}${after}`;
          setBody(next);
          requestAnimationFrame(() => {
            textareaRef.current?.focus();
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = before.length;
            }
          });
        }
      }
      try {
        await copilotRef.current?.run(action as CopilotAction, { context: extra });
      } catch {
        toast.error("AI failed—try again");
      }
    },
    [body],
  );

  const insertMacro = React.useCallback(
    (text: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const before = body.slice(0, start);
      const after = body.slice(end);
      const next = `${before}${text}${after}`;
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = before.length + text.length;
        el.selectionStart = el.selectionEnd = cursor;
      });
    },
    [body],
  );

  const applyDraft = React.useCallback(
    (draft: { subject?: string; body?: string }) => {
      if (draft.subject) {
        setSubject(draft.subject);
      }
      if (draft.body) {
        setBody(draft.body);
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [],
  );

  const handleAssistInsert = React.useCallback(
    ({ subject: nextSubject, body: nextBody }: { subject: string; body: string }) => {
      setSubject(nextSubject ?? "");
      setBody((prev) => {
        const existing = prev ?? "";
        const incoming = nextBody ?? "";
        if (!existing.trim()) return incoming;
        if (!incoming.trim()) return existing;
        return `${existing.trimEnd()}\n\n${incoming}`;
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [],
  );

  return (
    <div className="space-y-4">
      <ThreadAssist
        threadId={threadId}
        campaignId={campaignId}
        calendarId={calendarId}
        accountId={accountId}
        fromEmail={fromEmail}
        toEmail={toEmail}
        onInsert={handleAssistInsert}
      />

      <div className="relative space-y-3 rounded-2xl border p-4">
        <PreflightBanner payload={preflightPayload} onResult={setPreflight} />
        <ComposerHeader
          threadId={threadId}
          label={label}
          onLabelChange={(next) => {
            setLabel(next as typeof label);
          }}
        />
        {quietInfo?.quiet ? (
          <Badge variant="outline" className="border-dashed">
            Quiet hours active — queued
          </Badge>
        ) : quietLoading ? (
          <Badge variant="outline" className="border-dashed opacity-70">
            Checking quiet hours…
          </Badge>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <ScheduleDraftButton
            threadId={threadId}
            onDraft={({ subject: nextSubject, body: nextBody }) => {
              applyDraft({ subject: nextSubject, body: nextBody });
            }}
          />
          <CloseDraftButton
            threadId={threadId}
            onDraft={({ subject: nextSubject, body: nextBody }) => {
              applyDraft({ subject: nextSubject, body: nextBody });
            }}
          />
          {calendarId ? (
            <OfferTimes
              threadId={threadId}
              campaignId={campaignId}
              calendarId={calendarId}
              onInsert={insertMacro}
            />
          ) : null}
        </div>

        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />

        <CopilotBar
          ref={copilotRef}
          textareaRef={textareaRef}
          campaignId={campaignId}
          threadId={threadId}
          getContext={() => subject}
        />

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="h-48 w-full resize-y rounded-md border px-3 py-2 text-sm"
            placeholder="Write your reply…"
          />
          <AiSlashMenu open={aiOpen} setOpen={setAiOpen} onSubmit={runAi} />
          <MacroSlashMenu campaignId={campaignId} threadId={threadId} onInsert={insertMacro} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving}>
            {saving ? "Saving…" : "Save Draft"}
          </Button>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={sendNow}
                  disabled={
                    sending || preflightBusy || (preflight?.severity === "fail" && !preflightBusy)
                  }
                >
                  {sending ? "Sending…" : preflightBusy ? "Checking…" : "Send Now"}
                </Button>
              </TooltipTrigger>
              {preflight?.severity === "fail" && (
                <TooltipContent>
                  <div className="max-w-xs text-xs">
                    {(preflight.failing ?? preflight.checks.filter((c) => !c.ok).map((c) => c.key))
                      .slice(0, 4)
                      .join(", ")}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

