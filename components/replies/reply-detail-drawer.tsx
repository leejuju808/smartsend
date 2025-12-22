"use client";

import * as React from "react";
import {
  getReplyDetail,
  type ReplyDetail,
} from "@/app/api/replies/detail/actions";
import {
  updateReplyClassification,
  type UpdateReplyInput,
} from "@/app/api/replies/update/actions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  MailOpen,
  User,
  Target,
  CalendarCheck2,
  MessageCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { IntentSummary } from "./IntentSummary";

interface ReplyDetailDrawerProps {
  replyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

function kindBadge(reply: ReplyDetail | null) {
  if (!reply) return null;

  if (reply.reply_kind === "positive_meeting") {
    return <Badge className="bg-emerald-500/15 text-emerald-600">Meeting</Badge>;
  }
  if (reply.reply_kind === "positive_no_meeting") {
    return <Badge className="bg-green-500/15 text-green-600">Positive</Badge>;
  }
  if (reply.reply_kind === "neutral_question") {
    return <Badge className="bg-blue-500/15 text-blue-600">Question</Badge>;
  }
  if (reply.reply_kind === "ooh") {
    return <Badge className="bg-amber-500/15 text-amber-600">OOTO</Badge>;
  }
  if (reply.reply_kind === "unsubscribe" || reply.is_unsubscribe) {
    return <Badge className="bg-red-500/15 text-red-600">Unsubscribe</Badge>;
  }
  if (reply.reply_kind === "bounce" || reply.is_bounce) {
    return <Badge className="bg-slate-500/15 text-slate-600">Bounce</Badge>;
  }
  return <Badge variant="outline">Other</Badge>;
}

export function ReplyDetailDrawer({
  replyId,
  open,
  onOpenChange,
  onUpdated,
}: ReplyDetailDrawerProps) {
  const [reply, setReply] = React.useState<ReplyDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !replyId) {
      setReply(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getReplyDetail(replyId)
      .then((data) => {
        if (cancelled) return;
        setReply(data);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load reply");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, replyId]);

  async function applyUpdate(update: UpdateReplyInput, successMessage: string) {
    if (!replyId) return;

    setSaving(true);
    try {
      await updateReplyClassification({ replyId, ...update });
      toast.success(successMessage);
      if (onUpdated) onUpdated();
      // refresh local detail
      const data = await getReplyDetail(replyId);
      setReply(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update reply");
    } finally {
      setSaving(false);
    }
  }

  const handled = reply?.handled_status === "done";

  const headerLabel = reply?.campaign_name
    ? `Reply from ${reply.from_email || "unknown"}`
    : `Reply from ${reply?.from_email || "unknown"}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 border-l bg-background p-0 sm:max-w-xl">
        <div className="border-b px-4 py-3">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <MailOpen className="h-4 w-4 text-primary" />
              Reply details
            </SheetTitle>
            <SheetDescription className="text-xs">
              Classify and handle the reply. Changes update the lead & campaign stats.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 space-y-3 px-4 py-3">
          {loading || !reply ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Top summary */}
              <Card className="border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{headerLabel}</span>
                      {kindBadge(reply)}
                      {reply.has_meeting_intent && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/50 text-[10px] text-emerald-600"
                        >
                          Meeting intent
                        </Badge>
                      )}
                      {handled && (
                        <Badge
                          variant="outline"
                          className="border-slate-500/50 text-[10px] text-slate-600"
                        >
                          Done
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3" />
                        {reply.lead_name || reply.lead_email || reply.from_email || "Unknown lead"}
                      </span>
                      {reply.lead_company && (
                        <span className="text-[11px] text-muted-foreground">
                          {reply.lead_title ? `${reply.lead_title} @ ` : ""}
                          {reply.lead_company}
                        </span>
                      )}
                      {reply.campaign_name && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Target className="h-3 w-3" />
                          Campaign: {reply.campaign_name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CalendarCheck2 className="h-3 w-3" />
                        {new Date(reply.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">AI label</p>
                    <p className="text-xs font-medium">
                      {reply.ai_label || "Unlabeled"}
                    </p>
                    {typeof reply.ai_score === "number" && (
                      <p className="text-[10px] text-muted-foreground">
                        {(reply.ai_score * 100).toFixed(0)}% confident
                      </p>
                    )}
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">Kind</p>
                    <p className="text-xs font-medium">
                      {reply.reply_kind || "—"}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">Handled</p>
                    <p className="text-xs font-medium">
                      {reply.handled_status === "done" ? "Done" : "Open"}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Block 486: Intent Summary */}
              <IntentSummary reply={reply} />

              {/* Manual action buttons */}
              <Card className="border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium">Classification</p>
                  {saving && (
                    <span className="inline-flex items-center text-[11px] text-muted-foreground">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Saving…
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-[11px]"
                    disabled={saving}
                    onClick={() =>
                      applyUpdate(
                        {
                          reply_kind: "positive_meeting",
                          has_meeting_intent: true,
                          is_unsubscribe: false,
                          is_bounce: false,
                          label: "Positive — meeting",
                        },
                        "Marked as meeting reply"
                      )
                    }
                  >
                    <MessageCircle className="mr-1 h-3 w-3 text-emerald-500" />
                    Meeting
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-[11px]"
                    disabled={saving}
                    onClick={() =>
                      applyUpdate(
                        {
                          reply_kind: "positive_no_meeting",
                          has_meeting_intent: false,
                          is_unsubscribe: false,
                          is_bounce: false,
                          label: "Positive",
                        },
                        "Marked as positive reply"
                      )
                    }
                  >
                    <MessageCircle className="mr-1 h-3 w-3 text-green-500" />
                    Positive
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-[11px]"
                    disabled={saving}
                    onClick={() =>
                      applyUpdate(
                        {
                          reply_kind: "neutral_question",
                          has_meeting_intent: false,
                          is_unsubscribe: false,
                          is_bounce: false,
                          label: "Question",
                        },
                        "Marked as question"
                      )
                    }
                  >
                    <MessageCircle className="mr-1 h-3 w-3 text-blue-500" />
                    Question
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-[11px]"
                    disabled={saving}
                    onClick={() =>
                      applyUpdate(
                        {
                          reply_kind: "unsubscribe",
                          has_meeting_intent: false,
                          is_unsubscribe: true,
                          is_bounce: false,
                          label: "Unsubscribe",
                        },
                        "Marked as unsubscribe and lead unsubscribed"
                      )
                    }
                  >
                    <XCircle className="mr-1 h-3 w-3 text-red-500" />
                    Unsubscribe
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-[11px]"
                    disabled={saving}
                    onClick={() =>
                      applyUpdate(
                        {
                          reply_kind: "bounce",
                          has_meeting_intent: false,
                          is_unsubscribe: false,
                          is_bounce: true,
                          label: "Bounce",
                        },
                        "Marked as bounce and lead bounced"
                      )
                    }
                  >
                    <XCircle className="mr-1 h-3 w-3 text-slate-500" />
                    Bounce
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-[11px]"
                    disabled={saving}
                    onClick={() =>
                      applyUpdate(
                        {
                          reply_kind: "other",
                          has_meeting_intent: false,
                          is_unsubscribe: false,
                          is_bounce: false,
                          label: "Other",
                        },
                        "Marked as other"
                      )
                    }
                  >
                    <AlertTriangle className="mr-1 h-3 w-3 text-amber-500" />
                    Other
                  </Button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Classification updates reply, send log, and lead email_status.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant={handled ? "outline" : "default"}
                    className="text-[11px]"
                    disabled={saving}
                    onClick={() =>
                      applyUpdate(
                        { handled_status: handled ? "open" : "done" },
                        handled ? "Marked as open" : "Marked as done"
                      )
                    }
                  >
                    {handled ? "Mark as open" : "Mark as done"}
                  </Button>
                </div>
              </Card>

              {/* Raw email text */}
              <Card className="border bg-card p-3">
                <p className="mb-2 text-xs font-medium">Reply body</p>
                <div className="max-h-[260px] overflow-auto rounded-md border bg-background px-2 py-2">
                  <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {reply.raw_text || "(no body text)"}
                  </pre>
                </div>
              </Card>
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t px-4 py-3">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
