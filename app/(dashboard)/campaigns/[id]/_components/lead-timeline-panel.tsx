// app/(dashboard)/campaigns/[campaignId]/_components/lead-timeline-panel.tsx

"use client";

import * as React from "react";
import { X, Copy, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ReplyIntentBadge } from "@/components/replies/reply-intent-badge";
import {
  CampaignLeadStatus,
  CampaignLeadStatusBadge,
} from "@/components/campaigns/campaign-lead-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ReplyIntent =
  | "positive"
  | "neutral"
  | "negative"
  | "out_of_office"
  | "unsubscribe"
  | "bounce"
  | "spam"
  | "wrong_person"
  | "referral"
  | "not_sure"
  | null;

type TimelineItemType = "sent" | "reply";

export interface LeadTimelineItem {
  id: string;
  type: TimelineItemType;
  at: string;
  subject?: string | null;
  body: string;
  from_email?: string | null;
  to_email?: string | null;
  intent?: ReplyIntent;
  sentiment?: "positive" | "neutral" | "negative" | null;
}

export interface LeadTimelinePanelData {
  id: string;
  lead_id: string;
  name?: string | null;
  email: string;
  status: CampaignLeadStatus;
  last_reply_intent: ReplyIntent;
  thread_summary?: string | null;
  thread_stage?: string | null;
  thread_next_action?: string | null;
  thread_priority?: string | null;
  timeline: LeadTimelineItem[];
}

interface LeadTimelinePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: LeadTimelinePanelData | null;
  campaignId: string;
}

const stageLabel: Record<string, string> = {
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  no_fit: "No Fit",
  unknown: "Unknown",
};

const priorityLabel: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function LeadTimelinePanel({
  open,
  onOpenChange,
  data,
  campaignId,
}: LeadTimelinePanelProps) {
  const [tone, setTone] = React.useState<"casual" | "neutral" | "formal">("neutral");
  const [length, setLength] = React.useState<"short" | "medium" | "long">("medium");
  const [draftSubject, setDraftSubject] = React.useState("");
  const [draftBody, setDraftBody] = React.useState("");
  const [isGenerating, setIsGenerating] = React.useState(false);

  React.useEffect(() => {
    // Reset draft when switching leads
    setDraftSubject("");
    setDraftBody("");
  }, [data?.id]);

  if (!data) return null;

  const {
    name,
    email,
    status,
    last_reply_intent,
    thread_summary,
    thread_stage,
    thread_next_action,
    thread_priority,
    timeline,
    lead_id,
  } = data;

  const handleGenerateDraft = async () => {
    if (!data) return;

    try {
      setIsGenerating(true);
      const res = await fetch(
        `/api/campaigns/${campaignId}/lead-reply-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead_id,
            tone,
            length,
          }),
        }
      );

      if (res.status === 402) {
        // special upgrade case
        setDraftSubject("");
        setDraftBody(
          "Upgrade to SmartSend Pro to generate AI-powered reply drafts for this lead."
        );
        return;
      }

      if (!res.ok) {
        console.error("Failed to generate draft");
        return;
      }

      const json = await res.json();
      setDraftSubject(json.subject ?? "");
      setDraftBody(json.body ?? "");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyDraft = async () => {
    const full = (draftSubject ? `Subject: ${draftSubject}\n\n` : "") + draftBody;
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      // ignore if clipboard not available
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="flex flex-row items-center justify-between px-6 py-4 border-b">
          <div className="space-y-1 text-left">
            <SheetTitle className="text-base font-semibold">
              {name || "Unknown lead"}
            </SheetTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{email}</span>
              <CampaignLeadStatusBadge status={status} />
              <ReplyIntentBadge intent={last_reply_intent} />
            </div>
          </div>
          <button
            className="rounded-full p-1 hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 p-6 overflow-hidden">
          {/* Summary */}
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AI Thread Summary
              </span>
              <div className="flex items-center gap-2">
                {thread_stage && (
                  <Badge variant="secondary">
                    Stage: {stageLabel[thread_stage] ?? thread_stage}
                  </Badge>
                )}
                {thread_priority && (
                  <Badge variant="outline">
                    Priority: {priorityLabel[thread_priority] ?? thread_priority}
                  </Badge>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground min-h-[40px]">
              {thread_summary
                ? thread_summary
                : "No summary yet. It will appear after the first reply is processed."}
            </p>

            {thread_next_action && (
              <div className="rounded-xl bg-muted/60 px-3 py-2">
                <div className="text-xs font-semibold mb-1">Suggested next step</div>
                <p className="text-xs text-muted-foreground">
                  {thread_next_action}
                </p>
              </div>
            )}
          </div>

          {/* Smart Reply Drafts */}
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Smart Reply Draft
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={tone}
                  onValueChange={(v) =>
                    setTone(v as "casual" | "neutral" | "formal")
                  }
                >
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue placeholder="Tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={length}
                  onValueChange={(v) =>
                    setLength(v as "short" | "medium" | "long")
                  }
                >
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue placeholder="Length" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="long">Long</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="text-xs"
                  disabled={isGenerating}
                  onClick={handleGenerateDraft}
                >
                  {isGenerating ? "Generating…" : "Generate"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <input
                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                placeholder="Subject"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
              />
              <Textarea
                className="min-h-[120px] text-xs"
                placeholder="Your reply draft will appear here…"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1"
                disabled={!draftBody}
                onClick={handleCopyDraft}
              >
                <Copy className="h-3 w-3" />
                Copy to clipboard
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 min-h-0 rounded-2xl border bg-card flex flex-col">
            <div className="border-b px-4 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Timeline
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-4">
                {timeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No emails or replies yet.
                  </p>
                ) : (
                  timeline.map((item, idx) => {
                    const isReply = item.type === "reply";
                    return (
                      <div key={item.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                              isReply ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                            }`}
                          >
                            {isReply ? "R" : "S"}
                          </div>
                          {idx < timeline.length - 1 && (
                            <div className="flex-1 w-px bg-border mt-1" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">
                                {isReply ? "Reply" : "Sent email"}
                              </span>
                              {isReply && (
                                <ReplyIntentBadge
                                  intent={item.intent ?? null}
                                  sentiment={item.sentiment ?? null}
                                  className="text-[10px] px-1.5 py-0"
                                />
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(item.at).toLocaleString()}
                            </span>
                          </div>
                          {item.subject && (
                            <div className="text-xs font-semibold">
                              {item.subject}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground whitespace-pre-line">
                            {item.body}
                          </div>
                          <div className="text-[10px] text-muted-foreground/80">
                            {item.from_email && (
                              <span>From: {item.from_email} </span>
                            )}
                            {item.to_email && <span>· To: {item.to_email}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

