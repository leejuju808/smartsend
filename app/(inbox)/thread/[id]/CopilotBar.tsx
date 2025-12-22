"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Wand2,
  List,
  Type,
  UserRound,
  FileText,
  Eraser,
} from "lucide-react";
import { toast } from "sonner";

export type Action = "shorten" | "expand" | "clarify" | "friendlier" | "formal" | "bulletize" | "fix";

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  campaignId: string;
  threadId: string;
  getContext?: () => string;
};

export type CopilotHandle = {
  run: (action: Action, options?: { context?: string }) => Promise<void>;
  undo: () => void;
};

export const CopilotBar = React.forwardRef<CopilotHandle, Props>(function CopilotBar(
  { textareaRef, campaignId, threadId, getContext },
  ref,
) {
  const [loading, setLoading] = React.useState<Action | null>(null);
  const undoPayload = React.useRef<{
    value: string;
    selectionStart: number;
    selectionEnd: number;
  } | null>(null);
  const undoTimerRef = React.useRef<number | null>(null);
  const [canUndo, setCanUndo] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const run = React.useCallback(async (action: Action, options?: { context?: string }) => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const selected = el.value.slice(s, e) || el.value;
    if (!selected.trim()) {
      toast.info("Type something to transform");
      return;
    }

    setLoading(action);
    try {
      const resp = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          text: selected,
          context: options?.context ?? getContext?.(),
          campaign_id: campaignId,
          thread_id: threadId,
        }),
      });
      if (!resp.ok) {
        toast.error(resp.status === 429 ? "AI cooling down. Try again in a moment." : "AI failed—try again");
        return;
      }
      const data = await resp.json().catch(() => ({}));
      const out: string = data.text ?? selected;
      const latency: number | undefined = data.latency_ms;
      if (typeof latency === "number") {
        toast.success(`AI · ${latency}ms`);
      }

      undoPayload.current = {
        value: el.value,
        selectionStart: s,
        selectionEnd: e,
      };

      const before = el.value.slice(0, s);
      const after = el.value.slice(e);
      const next = before + out + after;
      const cursor = (before + out).length;

      el.value = next;
      el.focus();
      el.selectionStart = el.selectionEnd = cursor;
      el.dispatchEvent(new Event("input", { bubbles: true }));

      setCanUndo(true);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => {
        undoPayload.current = null;
        setCanUndo(false);
      }, 10_000);
    } catch (e) {
      console.error(e);
      toast.error("AI failed—try again");
    } finally {
      setLoading(null);
    }
  }, [campaignId, getContext, textareaRef, threadId]);

  const handleUndo = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el || !undoPayload.current) return;
    const { value, selectionStart, selectionEnd } = undoPayload.current;
    el.value = value;
    el.focus();
    el.selectionStart = selectionStart;
    el.selectionEnd = selectionEnd;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    undoPayload.current = null;
    setCanUndo(false);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    toast.success("AI change undone");
  }, [textareaRef]);

  React.useImperativeHandle(
    ref,
    () => ({
      run,
      undo: handleUndo,
    }),
    [handleUndo, run],
  );

  const Btn = ({ a, label, icon: Icon }: { a: Action; label: string; icon: React.ComponentType<{ className?: string }> }) => (
    <Button size="sm" variant="outline" onClick={() => run(a)} disabled={!!loading || loading === a} className="h-7">
      {loading === a ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-background p-1">
      <Btn a="shorten" label="Shorten" icon={Wand2} />
      <Btn a="expand" label="Expand" icon={FileText} />
      <Btn a="clarify" label="Clarify" icon={Type} />
      <Btn a="friendlier" label="Friendlier" icon={UserRound} />
      <Btn a="formal" label="Formal" icon={Type} />
      <Btn a="bulletize" label="Bulletize" icon={List} />
      <Btn a="fix" label="Fix Typos" icon={Eraser} />
      {canUndo && (
        <Button variant="ghost" size="sm" onClick={handleUndo} className="ml-1 h-7 text-muted-foreground">
          Undo
        </Button>
      )}
    </div>
  );
});

