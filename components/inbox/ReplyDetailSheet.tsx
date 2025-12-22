"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReplyIntentBadges } from "@/components/inbox/ReplyIntentBadges";
import { useReplyDetail } from "@/lib/hooks/useReplyDetail";
import { Mail, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

type Props = {
  replyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReplyDetailSheet({ replyId, open, onOpenChange }: Props) {
  const { data, loading, error, reload } = useReplyDetail(replyId);

  const [savingDeal, setSavingDeal] = useState(false);
  const [dealStage, setDealStage] = useState<string | null>(null);
  const [dealValueStr, setDealValueStr] = useState("");
  const [dealNote, setDealNote] = useState("");

  // whenever data changes, sync local state
  useEffect(() => {
    if (!data) return;
    setDealStage(data.meeting_stage || null);

    const dollars =
      data.deal_value_cents != null
        ? (data.deal_value_cents / 100).toFixed(2)
        : "";
    setDealValueStr(dollars === "0.00" ? "" : dollars);
    setDealNote(data.meeting_note || "");
  }, [data]);

  const handleOpenChange = (value: boolean) => {
    onOpenChange(value);
  };

  const bodyHtml = data?.body_html;
  const bodyText = data?.body_text;

  const updateStatus = async (status?: string, assignToSelf?: boolean) => {
    if (!replyId) return;
    const payload: any = {};
    if (status) payload.status = status;
    if (assignToSelf) payload.assignToSelf = true;

    try {
      const res = await fetch(
        `/api/inbox/replies/${replyId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        console.error("status update failed");
        return;
      }
      await reload();
    } catch (err) {
      console.error("status update error", err);
    }
  };

  const applyStopFollowups = async () => {
    if (!replyId) return;
    try {
      const res = await fetch(
        `/api/inbox/replies/${replyId}/stop-followups`,
        {
          method: "POST",
        }
      );
      const json = await res.json();
      if (!res.ok) {
        console.error("stop-followups failed", json);
        alert("Could not stop followups for this lead. Check console.");
        return;
      }
      // Optionally you can also update status to 'done'
      await reload();
      alert("Future followups have been stopped for this lead.");
    } catch (err) {
      console.error("stop-followups error", err);
      alert("Something went wrong while stopping followups.");
    }
  };

  const saveDeal = async () => {
    if (!replyId) return;
    setSavingDeal(true);
    try {
      let cents: number | undefined = undefined;
      if (dealValueStr.trim().length > 0) {
        const v = parseFloat(dealValueStr);
        if (!isNaN(v) && v >= 0) {
          cents = Math.round(v * 100);
        }
      }

      const payload: any = {
        meeting_stage: dealStage ?? null,
        meeting_note: dealNote ?? null,
      };
      if (cents !== undefined) {
        payload.deal_value_cents = cents;
      } else {
        payload.deal_value_cents = null;
      }

      const res = await fetch(`/api/inbox/replies/${replyId}/meeting`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error("saveDeal failed", json);
        alert("Could not save deal details.");
        return;
      }
      await reload();
    } catch (err) {
      console.error("saveDeal error", err);
      alert("Something went wrong while saving deal details.");
    } finally {
      setSavingDeal(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-slate-950 border-slate-800 flex flex-col"
      >
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-sky-400" />
            {data?.subject || "(no subject)"}
          </SheetTitle>
          <SheetDescription className="text-[11px] flex flex-col gap-1">
            {data?.lead_email && (
              <span className="text-[11px]">
                From{" "}
                <span className="font-medium">
                  {data.lead_email}
                </span>
              </span>
            )}
            {data?.received_at && (
              <span className="text-[11px] text-muted-foreground">
                Received{" "}
                {new Date(data.received_at).toLocaleString()}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Top meta + actions */}
        <div className="mt-3 flex flex-col gap-3">
          {data && (
            <>
              <ReplyIntentBadges
                aiCategory={data.ai_category}
                aiHasMeeting={data.ai_has_meeting}
                aiStopFollowups={data.ai_stop_followups}
              />
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium">
                  Status:
                </span>
                <span>
                  {data.status || "new"}
                </span>
                {data.owner_user_id && (
                  <span className="ml-2">
                    • Assigned
                  </span>
                )}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={reload}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => updateStatus(undefined, true)}
              disabled={loading || !replyId}
            >
              Assign to me
            </Button>

            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => updateStatus("done", true)}
              disabled={loading || !replyId}
            >
              Mark handled
            </Button>

            {data?.status && data.status !== "new" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => updateStatus("new", false)}
                disabled={loading || !replyId}
              >
                Reopen
              </Button>
            )}

            {/* Stop future followups */}
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-2 text-[11px]"
              onClick={applyStopFollowups}
              disabled={loading || !replyId}
            >
              Stop future followups
            </Button>

            {/* Future: deep-link to Gmail/Outlook */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open in email client
            </Button>
          </div>

          {error && (
            <p className="text-[11px] text-rose-400">{error}</p>
          )}
        </div>

        {/* Deal section */}
        {data?.ai_has_meeting && (
          <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">
                Deal
              </span>
              <Button
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={saveDeal}
                disabled={savingDeal || !replyId}
              >
                {savingDeal ? "Saving…" : "Save deal"}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">
                  Stage
                </span>
                <Select
                  value={dealStage ?? ""}
                  onValueChange={(val) =>
                    setDealStage(val === "" ? null : val)
                  }
                >
                  <SelectTrigger className="h-7 px-2 text-[11px] bg-slate-950 border-slate-800">
                    <SelectValue placeholder="Select stage…" />
                  </SelectTrigger>
                  <SelectContent className="text-[11px]">
                    <SelectItem value="">No stage</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                    <SelectItem value="closed_won">Closed won</SelectItem>
                    <SelectItem value="closed_lost">Closed lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">
                  Value (USD)
                </span>
                <Input
                  className="h-7 text-[11px] bg-slate-950 border-slate-800"
                  placeholder="e.g. 1500"
                  value={dealValueStr}
                  onChange={(e) => setDealValueStr(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">
                Notes / next steps
              </span>
              <Textarea
                rows={3}
                className="text-[11px] bg-slate-950 border-slate-800"
                value={dealNote}
                onChange={(e) => setDealNote(e.target.value)}
                placeholder="e.g. Needs proposal by Friday, prefers mornings, etc."
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/80 p-3">
          {loading && (
            <p className="text-[11px] text-muted-foreground">
              Loading message…
            </p>
          )}

          {!loading && !bodyHtml && !bodyText && (
            <p className="text-[11px] text-muted-foreground">
              No message body found for this reply.
            </p>
          )}

          {!loading && bodyHtml && (
            <div
              className="prose prose-invert max-w-none text-[11px]"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          )}

          {!loading && !bodyHtml && bodyText && (
            <pre className="whitespace-pre-wrap text-[11px] font-normal">
              {bodyText}
            </pre>
          )}
        </div>

        {/* Future: footer actions (Mark handled, Create task, etc.) */}
        <div className="mt-3 flex justify-end gap-2 text-[11px]">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

