"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CalendarDays, Loader2, Play, Reply, Send, ShieldAlert } from "lucide-react";

type SmartActionsProps = {
  threadId: string;
  leadId: string;
  isSuppressed: boolean;
  isLeadPaused: boolean;
  aiIntent?: string | null;
  needsReview?: boolean;
  onResume?: () => void;
  onSuppressed?: () => void;
};

type RunOptions = {
  successMessage?: string;
  onSuccess?: () => void;
};

async function postJson(url: string, payload?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || (data && data.error)) {
    const detail = data?.detail ? `: ${data.detail}` : "";
    const errorMessage = data?.error ? `${data.error}${detail}` : `request_failed${detail}`;
    return { error: errorMessage };
  }

  return data ?? { ok: true };
}

function normalizeIntent(value?: string | null) {
  if (!value) return "";
  return value.toLowerCase();
}

export function SmartActions({
  threadId,
  leadId,
  isSuppressed,
  isLeadPaused,
  aiIntent,
  needsReview,
  onResume,
  onSuppressed,
}: SmartActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const normalizedIntent = useMemo(() => normalizeIntent(aiIntent), [aiIntent]);
  const quickReplyTone = useMemo(
    () => (normalizedIntent === "question" ? "answer" : "friendly"),
    [normalizedIntent],
  );
  const isOutOfOffice = normalizedIntent === "out_of_office" || normalizedIntent === "ooo";
  const nudgeBlocked =
    Boolean(needsReview) && !["no_reply", "neutral"].includes(normalizedIntent);
  const showResume = isSuppressed || isLeadPaused;

  const run = useCallback(
    async (key: string, action: () => Promise<any>, options?: RunOptions) => {
      if (loading) return;
      setLoading(key);
      try {
        const result = await action();
        if (result?.error) {
          throw new Error(result.error);
        }

        if (options?.successMessage) {
          toast.success(options.successMessage);
        }

        options?.onSuccess?.();
        router.refresh();
        window.dispatchEvent(new CustomEvent("thread:list:refresh"));
        window.dispatchEvent(new CustomEvent("inbox:counts:refresh"));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong. Try again.";
        toast.error(message);
      } finally {
        setLoading(null);
      }
    },
    [loading, router],
  );

  const handleQuickReply = useCallback(() => {
    return run(
      "quick",
      () =>
        postJson("/api/smart/quick-reply", {
          thread_id: threadId,
          tone: quickReplyTone,
        }),
      { successMessage: "Quick reply queued" },
    );
  }, [quickReplyTone, run, threadId]);

  const handleNudge = useCallback(() => {
    return run(
      "nudge",
      () => postJson("/api/smart/nudge", { thread_id: threadId }),
      { successMessage: "Nudge queued" },
    );
  }, [run, threadId]);

  const handleBookLink = useCallback(() => {
    return run(
      "book",
      () => postJson("/api/smart/book-link", { thread_id: threadId }),
      { successMessage: isOutOfOffice ? "Follow-up scheduled" : "Booking link sent" },
    );
  }, [isOutOfOffice, run, threadId]);

  const handleSuppress = useCallback(() => {
    return run(
      "suppress",
      () =>
        postJson("/api/suppress", {
          lead_id: leadId,
          reason: "manual",
          scope: "account",
        }),
      {
        successMessage: "Lead suppressed",
        onSuccess: () => {
          onSuppressed?.();
        },
      },
    );
  }, [leadId, onSuppressed, run]);

  const handleResume = useCallback(() => {
    return run(
      "resume",
      async () => {
        if (isSuppressed) {
          const unsuppress = await postJson(`/api/thread/${threadId}/unsuppress`, {});
          if (unsuppress?.error) {
            return unsuppress;
          }
        }

        return postJson("/api/followups/resume", { thread_id: threadId });
      },
      {
        successMessage: isSuppressed ? "Lead resumed" : "Follow-ups resumed",
        onSuccess: () => {
          onResume?.();
        },
      },
    );
  }, [isSuppressed, onResume, run, threadId]);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      if (key === "r" && !isSuppressed) {
        event.preventDefault();
        handleQuickReply();
      } else if (key === "n" && !isSuppressed && !nudgeBlocked) {
        event.preventDefault();
        handleNudge();
      } else if (key === "b" && !isSuppressed) {
        event.preventDefault();
        handleBookLink();
      } else if (key === "s" && !isSuppressed) {
        event.preventDefault();
        handleSuppress();
      } else if (key === "u" && showResume) {
        event.preventDefault();
        handleResume();
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [handleBookLink, handleNudge, handleQuickReply, handleResume, handleSuppress, isSuppressed, nudgeBlocked, showResume]);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={loading !== null || isSuppressed}
        onClick={handleQuickReply}
      >
        {loading === "quick" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Reply className="h-4 w-4" />
        )}
        <span className="ml-2">Quick Reply</span>
      </Button>

      <Button
        size="sm"
        variant="secondary"
        disabled={loading !== null || isSuppressed || nudgeBlocked}
        onClick={handleNudge}
        title={nudgeBlocked ? "Needs review before nudging" : undefined}
      >
        {loading === "nudge" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        <span className="ml-2">One-Click Nudge</span>
      </Button>

      <Button
        size="sm"
        variant="secondary"
        disabled={loading !== null || isSuppressed}
        onClick={handleBookLink}
      >
        {loading === "book" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarDays className="h-4 w-4" />
        )}
        <span className="ml-2">{isOutOfOffice ? "Send After Return" : "Book Link"}</span>
      </Button>

      {!isSuppressed ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={loading !== null}
          onClick={handleSuppress}
        >
          {loading === "suppress" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          <span className="ml-2">Suppress</span>
        </Button>
      ) : null}

      {showResume ? (
        <Button
          size="sm"
          variant="default"
          disabled={loading !== null}
          onClick={handleResume}
        >
          {loading === "resume" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="ml-2">Resume</span>
        </Button>
      ) : null}
    </div>
  );
}





