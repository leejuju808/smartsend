"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  MessageCircle,
  Sparkles,
  Loader2,
  RefreshCcw,
  ArrowRightCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Reply = {
  id: string;
  intent_label: string | null;
  intent_confidence: number | null;
  suggested_pipeline_stage: string | null;
  suggested_action: string | null;
  intent_last_scored_at: string | null;
  created_at: string;
};

type Lead = {
  id: string;
  pipeline_stage?: string | null;
};

type QuickActionType =
  | "move_stage"
  | "mark_not_interested"
  | "mark_disqualified"
  | "move_to_nurture"
  | "move_to_hold";

export function LeadReplyInsights({
  lead,
  latestReply,
}: {
  lead: Lead;
  latestReply: Reply | null;
}) {
  const [reply, setReply] = useState<Reply | null>(latestReply);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string | null>(
    lead.pipeline_stage ?? null,
  );

  if (!reply) {
    return (
      <Card className="p-4 text-xs">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Reply insights</h3>
            <p className="text-[11px] text-muted-foreground">
              Once this lead replies, AI will summarize their intent and suggest next steps.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const handleRescore = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reply-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply_id: reply.id }),
      });
      const json = await res.json();
      if (json.reply) setReply(json.reply);
    } catch (err) {
      console.error(err);
      alert("Failed to rescore reply intent");
    } finally {
      setLoading(false);
    }
  };

  const runQuickAction = async ({
    action_type,
    pipeline_stage,
  }: {
    action_type: QuickActionType;
    pipeline_stage?: string;
  }) => {
    setActing(true);
    try {
      const res = await fetch("/api/reply-intent/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          reply_id: reply.id,
          action_type,
          pipeline_stage,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        console.error(json);
        alert("Failed to apply quick action");
        return;
      }

      if (json.pipeline_stage) {
        setPipelineStage(json.pipeline_stage);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to apply quick action");
    } finally {
      setActing(false);
    }
  };

  const intent = reply.intent_label || "unlabeled";
  const confidence = reply.intent_confidence ?? 0;
  const lastScored = reply.intent_last_scored_at
    ? new Date(reply.intent_last_scored_at).toLocaleString()
    : null;

  const intentBadgeClass = (label: string) => {
    switch (label) {
      case "ready_to_meet":
        return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
      case "open_to_chat":
      case "needs_info":
      case "follow_up_later":
        return "border-blue-500/40 bg-blue-500/10 text-blue-500";
      case "not_interested":
        return "border-red-500/40 bg-red-500/10 text-red-500";
      case "out_of_office":
      case "wrong_person":
        return "border-amber-500/40 bg-amber-500/10 text-amber-500";
      case "spam":
        return "border-slate-500/40 bg-slate-500/10 text-slate-500";
      default:
        return "border-slate-500/40 bg-slate-500/5 text-slate-600";
    }
  };

  // Decide recommended actions based on intent
  type UiAction = {
    label: string;
    subtleLabel?: string;
    action_type: QuickActionType;
    pipeline_stage?: string;
    variant?: "default" | "outline";
  };

  const primaryActions: UiAction[] = [];

  if (intent === "ready_to_meet") {
    primaryActions.push({
      label: "Move to meeting_booked",
      subtleLabel: "Lead is ready to meet",
      action_type: "move_stage",
      pipeline_stage: "meeting_booked",
      variant: "default",
    });
  } else if (intent === "open_to_chat" || intent === "needs_info") {
    primaryActions.push({
      label: "Move to active_conversation",
      subtleLabel: "Lead is engaged",
      action_type: "move_stage",
      pipeline_stage: "active_conversation",
      variant: "default",
    });
  } else if (intent === "follow_up_later") {
    primaryActions.push({
      label: "Move to nurture",
      subtleLabel: "Follow up later",
      action_type: "move_to_nurture",
      variant: "default",
    });
  } else if (intent === "not_interested") {
    primaryActions.push({
      label: "Mark as closed_lost",
      subtleLabel: "Lead not interested",
      action_type: "mark_not_interested",
      variant: "default",
    });
  } else if (intent === "wrong_person") {
    primaryActions.push({
      label: "Move to hold",
      subtleLabel: "Wrong contact, hold",
      action_type: "move_to_hold",
      variant: "default",
    });
  }

  // Common secondary actions
  const secondaryActions: UiAction[] = [];

  if (intent !== "not_interested") {
    secondaryActions.push({
      label: "Mark not interested",
      action_type: "mark_not_interested",
      variant: "outline",
    });
  }

  if (intent !== "follow_up_later" && intent !== "not_interested") {
    secondaryActions.push({
      label: "Move to nurture",
      action_type: "move_to_nurture",
      variant: "outline",
    });
  }

  const renderActionButton = (a: UiAction) => (
    <Button
      key={a.label}
      size="sm"
      variant={a.variant || "default"}
      className="h-7 text-[11px]"
      disabled={acting}
      onClick={() =>
        runQuickAction({
          action_type: a.action_type,
          pipeline_stage: a.pipeline_stage,
        })
      }
    >
      <ArrowRightCircle className="mr-1 h-3 w-3" />
      {a.label}
    </Button>
  );

  return (
    <Card className="space-y-3 p-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Reply insights</h3>
            <p className="text-[11px] text-muted-foreground">
              AI-detected intent and one-click actions for this reply.
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-purple-500/40 bg-purple-500/10 text-[10px] text-purple-500"
        >
          <Sparkles className="mr-1 h-3 w-3" />
          AI SDR
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Intent</p>
          <Badge
            variant="outline"
            className={cn("text-[10px] capitalize", intentBadgeClass(intent))}
          >
            {intent.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="w-32">
          <p className="text-[10px] text-muted-foreground text-right">
            Confidence
          </p>
          <div className="flex items-center gap-1">
            <Progress value={confidence * 100} className="h-1.5 flex-1" />
            <span className="text-[10px] text-muted-foreground">
              {(confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Pipeline + suggested action */}
      <div className="space-y-1 rounded-md border bg-muted/40 p-2">
        <p className="text-[10px] font-semibold">
          Pipeline stage (current)
        </p>
        <p className="text-[11px]">
          {pipelineStage || "(none)"}
        </p>
      </div>

      <div className="space-y-1 rounded-md border bg-muted/40 p-2">
        <p className="text-[10px] font-semibold">Suggested action</p>
        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
          {reply.suggested_action || "—"}
        </p>
      </div>

      {/* Quick action buttons */}
      {(primaryActions.length > 0 || secondaryActions.length > 0) && (
        <div className="space-y-2 rounded-md border bg-card/60 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold">
              One-click actions
            </span>
            {acting && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Applying…
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {primaryActions.map(renderActionButton)}
            {secondaryActions.map(renderActionButton)}
          </div>
        </div>
      )}

      {/* Footer: rescore + last scored */}
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={handleRescore}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Rescoring…
            </>
          ) : (
            <>
              <RefreshCcw className="mr-1 h-3 w-3" />
              Rescore intent
            </>
          )}
        </Button>
        {lastScored && (
          <p className="text-[10px] text-muted-foreground">
            Last scored: {lastScored}
          </p>
        )}
      </div>
    </Card>
  );
}

