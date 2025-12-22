"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useInboxThreadDetail } from "@/lib/hooks/useInboxThreadDetail";
import { ReplyCategoryBadge } from "@/components/inbox/ReplyCategoryBadge";
import {
  Mail,
  CornerDownRight,
  CheckCircle2,
  RotateCcw,
  Send,
  Sparkles,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo, useEffect } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
  campaignId: string | null;
};

export function InboxThreadDrawer({
  open,
  onOpenChange,
  leadId,
  campaignId,
}: Props) {
  const { data, loading, reload } = useInboxThreadDetail(leadId, campaignId);

  const lead = data?.lead;
  const campaign = data?.campaign;
  const events = data?.events || [];
  const threadStatus = data?.thread_status || "open";
  const followupsStopped = data?.followups?.stop_followups || false;
  const followupsStoppedAt = data?.followups?.stopped_at || null;
  const meetingBlock = data?.meeting || null;

  const leadName =
    (lead?.first_name || lead?.last_name) &&
    `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim();

  const [subject, setSubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [meetingStatus, setMeetingStatus] = useState<
    "pending" | "booked" | "completed" | "no_show" | "canceled"
  >("pending");
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);

  useEffect(() => {
    if (!meetingBlock) {
      setMeetingStatus("pending");
      setMeetingAt("");
      setMeetingNotes("");
      return;
    }

    setMeetingStatus(meetingBlock.status);
    setMeetingNotes(meetingBlock.notes || "");

    if (meetingBlock.meeting_at) {
      const d = new Date(meetingBlock.meeting_at);
      setMeetingAt(d.toLocaleString());
    } else {
      setMeetingAt("");
    }
  }, [meetingBlock]);

  function buildGoogleCalendarUrl(opts: {
    title: string;
    details: string;
    attendees?: string[];
    meetingAt: string;
  }) {
    const { title, details, attendees, meetingAt } = opts;
    if (!meetingAt) return null;

    // Parse meetingAt - it should be an ISO string or parseable date string
    const startDate = new Date(meetingAt);

    if (isNaN(startDate.getTime())) {
      return null;
    }

    // default 30-minute meeting
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

    const fmt = (d: Date) => {
      // yyyymmddThhmmssZ in UTC
      const pad = (n: number) => n.toString().padStart(2, "0");
      const year = d.getUTCFullYear();
      const month = pad(d.getUTCMonth() + 1);
      const day = pad(d.getUTCDate());
      const hours = pad(d.getUTCHours());
      const mins = pad(d.getUTCMinutes());
      const secs = pad(d.getUTCSeconds());
      return `${year}${month}${day}T${hours}${mins}${secs}Z`;
    };

    const dates = `${fmt(startDate)}/${fmt(endDate)}`;

    const params = new URLSearchParams();
    params.set("action", "TEMPLATE");
    params.set("text", title);
    params.set("details", details);
    params.set("dates", dates);
    if (attendees && attendees.length) {
      params.set("add", attendees.join(","));
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  const calendarUrl = useMemo(() => {
    if (!meetingAt) return null;

    const titleParts: string[] = [];
    if (campaign?.name) titleParts.push(campaign.name);
    if (lead?.email) titleParts.push(`with ${lead.email}`);
    const title =
      titleParts.length > 0 ? titleParts.join(" ") : "Sales meeting";

    const detailsLines: string[] = [];
    detailsLines.push("SmartSend meeting");
    if (lead?.email) detailsLines.push(`Lead: ${lead.email}`);
    if (lead?.company) detailsLines.push(`Company: ${lead.company}`);
    if (meetingNotes) {
      detailsLines.push("");
      detailsLines.push("Notes:");
      detailsLines.push(meetingNotes);
    }

    const details = detailsLines.join("\n");

    // Use meetingBlock.meeting_at if available (ISO string), otherwise try parsing meetingAt
    const dateString = meetingBlock?.meeting_at || meetingAt;

    return buildGoogleCalendarUrl({
      title,
      details,
      attendees: lead?.email ? [lead.email] : [],
      meetingAt: dateString,
    });
  }, [meetingAt, campaign?.name, lead?.email, lead?.company, meetingNotes, meetingBlock?.meeting_at]);

  const handleCopyEventDetails = async () => {
    if (!meetingAt) return;

    const lines: string[] = [];

    const title =
      campaign?.name && lead?.email
        ? `${campaign.name} — ${lead.email}`
        : campaign?.name || "Sales meeting";

    lines.push(title);
    lines.push("");

    lines.push(`When: ${meetingAt}`);
    if (lead?.email) {
      lines.push(`Lead: ${lead.email}`);
    }
    if (lead?.company) {
      lines.push(`Company: ${lead.company}`);
    }
    lines.push(`Status: ${meetingStatus}`);

    if (meetingNotes) {
      lines.push("");
      lines.push("Notes:");
      lines.push(meetingNotes);
    }

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      // swap for toast if you have one
      alert("Event details copied to clipboard.");
    } catch {
      alert("Could not copy to clipboard.");
    }
  };

  const latestInbound = useMemo(
    () =>
      events
        .filter((e) => e.kind === "inbound")
        .slice(-1)[0] as any | undefined,
    [events]
  );

  const inReplyToReplyId = latestInbound?.id || null;
  const lastInboundSubject = latestInbound?.subject || null;
  const lastInboundBody = latestInbound?.body || "";

  const handleStatusChange = async (status: "open" | "handled") => {
    if (!leadId || !campaignId) return;
    await fetch("/api/inbox/thread/state", {
      method: "PATCH",
      body: JSON.stringify({ leadId, campaignId, status }),
      headers: { "Content-Type": "application/json" },
    });
    // Reload the thread data
    reload();
  };

  const handleSendReply = async () => {
    if (!leadId || !campaignId || !replyBody.trim()) return;
    setSending(true);

    const res = await fetch("/api/inbox/reply", {
      method: "POST",
      body: JSON.stringify({
        leadId,
        campaignId,
        replyBody: replyBody.trim(),
        subject: subject.trim(),
        inReplyToReplyId,
      }),
      headers: { "Content-Type": "application/json" },
    });

    setSending(false);

    if (!res.ok) {
      alert("Failed to send reply. Please try again.");
      return;
    }

    setSubject("");
    setReplyBody("");
    await reload();
  };

  const handleGenerateAiReply = async () => {
    if (!leadId || !campaignId || !lastInboundBody) {
      // nothing to feed AI
      return;
    }

    setGenerating(true);

    const res = await fetch("/api/inbox/ai-reply", {
      method: "POST",
      body: JSON.stringify({
        leadId,
        campaignId,
        lastInboundSubject,
        lastInboundBody,
        // optional: "operatorStyle": "short, casual, friendly"
      }),
      headers: { "Content-Type": "application/json" },
    });

    setGenerating(false);

    if (!res.ok) {
      alert("AI draft failed. Please try again.");
      return;
    }

    const json = await res.json();
    if (json?.draft) {
      setReplyBody(json.draft);
    }
  };

  const handleSaveMeeting = async () => {
    if (!leadId || !campaignId) return;
    setSavingMeeting(true);

    // For now we send meetingAt as raw string; backend stores it as timestamptz if parseable.
    const res = await fetch("/api/inbox/thread/meeting", {
      method: "PATCH",
      body: JSON.stringify({
        leadId,
        campaignId,
        status: meetingStatus,
        meetingAt: meetingAt || null,
        notes: meetingNotes || null,
      }),
      headers: { "Content-Type": "application/json" },
    });

    setSavingMeeting(false);

    if (!res.ok) {
      alert("Failed to save meeting details.");
      return;
    }

    await reload();
  };

  const disableSend = sending || !replyBody.trim();
  const disableAi =
    generating || !leadId || !campaignId || !lastInboundBody;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader className="border-b border-slate-800 pb-3 mb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4" />
                {lead?.email || "Thread"}
              </SheetTitle>
              <SheetDescription className="text-[11px] flex flex-col gap-0.5">
                {leadName && (
                  <span>
                    {leadName}
                    {lead?.company && ` · ${lead.company}`}
                  </span>
                )}
                {campaign?.name && (
                  <span className="text-[11px] text-muted-foreground">
                    Campaign: {campaign.name}
                  </span>
                )}
              </SheetDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge
                className={
                  threadStatus === "handled"
                    ? "bg-emerald-900/80 border-emerald-600 text-[10px]"
                    : "bg-sky-900/80 border-sky-600 text-[10px]"
                }
              >
                {threadStatus === "handled" ? "Handled" : "Open"}
              </Badge>

              {followupsStopped && (
                <Badge className="bg-red-900/80 border-red-600 text-[10px]">
                  Followups stopped
                </Badge>
              )}

              <div className="flex items-center gap-1">
                {threadStatus === "handled" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handleStatusChange("open")}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reopen
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handleStatusChange("handled")}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Mark handled
                  </Button>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Quick Actions */}
        {leadId && (
          <div className="border-b border-slate-800 pb-2 mb-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-[11px] w-full"
              onClick={() => setCreateTaskModalOpen(true)}
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              Create Follow-Up Task
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {loading ? (
            <p className="text-[11px] text-muted-foreground">
              Loading thread…
            </p>
          ) : events.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No messages yet for this lead in this campaign.
            </p>
          ) : (
            events.map((e) => {
              const isInbound = e.kind === "inbound";

              return (
                <div
                  key={e.id}
                  className={
                    "rounded-md border px-3 py-2 space-y-1 " +
                    (isInbound
                      ? "bg-slate-950/80 border-slate-700"
                      : "bg-slate-900/60 border-slate-700/60")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          isInbound
                            ? "bg-emerald-900/80 border-emerald-600 text-[10px]"
                            : "bg-sky-900/80 border-sky-600 text-[10px]"
                        }
                      >
                        {isInbound ? "Reply from lead" : "Email sent"}
                      </Badge>
                      {isInbound && "ai_category" in e && (
                        <ReplyCategoryBadge
                          category={e.ai_category || undefined}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(e.at).toLocaleString()}
                    </span>
                  </div>

                  {e.subject && (
                    <div className="text-[11px] font-semibold">
                      {e.subject}
                    </div>
                  )}

                  {"ai_intent" in e &&
                    e.kind === "inbound" &&
                    e.ai_intent && (
                      <div className="text-[10px] text-emerald-300 flex items-center gap-1">
                        <CornerDownRight className="h-3 w-3" />
                        AI intent: {e.ai_intent}
                      </div>
                    )}

                  {"ai_has_meeting" in e &&
                    e.kind === "inbound" &&
                    e.ai_has_meeting && (
                      <div className="text-[10px] text-emerald-400">
                        Meeting intent detected in this reply.
                      </div>
                    )}

                  {"ai_stop_followups" in e &&
                    e.kind === "inbound" &&
                    e.ai_stop_followups && (
                      <div className="text-[10px] text-amber-300">
                        AI recommends stopping follow-ups for this lead.
                      </div>
                    )}

                  {e.kind === "outbound" && e.sender_email && (
                    <div className="text-[10px] text-muted-foreground">
                      From: {e.sender_email}
                    </div>
                  )}

                  {e.body && (
                    <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {e.body}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Meeting Outcome & Notes */}
        <div className="border-t border-slate-800 pt-3 mt-2 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px]">
              Meeting outcome
            </span>
            {meetingBlock?.meeting_at && (
              <span className="text-[10px] text-muted-foreground">
                Last set: {new Date(meetingBlock.meeting_at).toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="sm:w-1/3">
              <label className="block text-[10px] text-muted-foreground mb-1">
                Status
              </label>
              <Select
                value={meetingStatus}
                onValueChange={(v) =>
                  setMeetingStatus(
                    v as "pending" | "booked" | "completed" | "no_show" | "canceled"
                  )
                }
              >
                <SelectTrigger className="h-8 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="no_show">No show</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sm:w-2/3">
              <label className="block text-[10px] text-muted-foreground mb-1">
                Meeting time (optional)
              </label>
              <Input
                placeholder="e.g. 2025-11-20 14:00"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
                className="h-8 text-[11px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">
              Notes (what was agreed, next steps)
            </label>
            <Textarea
              rows={3}
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              className="text-[11px] resize-none"
              placeholder="Call booked for Tuesday 3 PM PST, will walk through onboarding…"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Keep a lightweight record of each meeting for this thread.
            </span>
            <Button
              size="sm"
              className="h-8 px-3 text-[11px]"
              onClick={handleSaveMeeting}
              disabled={savingMeeting}
            >
              {savingMeeting ? "Saving…" : "Save meeting"}
            </Button>
          </div>

          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-[11px]"
                onClick={handleCopyEventDetails}
                disabled={!meetingAt}
              >
                Copy event details
              </Button>

              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 px-3 text-[11px]"
                disabled={!calendarUrl}
              >
                {calendarUrl ? (
                  <a href={calendarUrl} target="_blank" rel="noreferrer">
                    Open in Google Calendar
                  </a>
                ) : (
                  <span>Open in Google Calendar</span>
                )}
              </Button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Uses meeting time + notes to prefill your calendar.
            </span>
          </div>
        </div>

        {/* Inline composer */}
        <div className="border-t border-slate-800 pt-3 mt-2 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px]">
              Reply to {lead?.email || "lead"}
            </span>
            {followupsStopped && (
              <span className="text-[10px] text-amber-300">
                Followups are stopped for this campaign, but you can still send a manual reply.
              </span>
            )}
          </div>

          <Input
            placeholder={
              campaign?.name
                ? `Re: ${campaign.name}`
                : "Subject (optional)"
            }
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 text-[11px]"
          />

          <Textarea
            placeholder="Type your reply or generate with AI…"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={4}
            className="text-[11px] resize-none"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-3 text-[11px] inline-flex items-center gap-1"
                disabled={disableAi}
                onClick={handleGenerateAiReply}
              >
                {generating ? (
                  "Generating…"
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Generate with AI
                  </>
                )}
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Uses latest reply as context.
              </span>
            </div>

            <Button
              size="sm"
              className="h-8 px-3 text-[11px]"
              disabled={disableSend}
              onClick={handleSendReply}
            >
              {sending ? (
                "Sending…"
              ) : (
                <>
                  <Send className="h-3 w-3 mr-1" />
                  Send reply
                </>
              )}
            </Button>
          </div>
        </div>

        <CreateTaskModal
          open={createTaskModalOpen}
          onClose={() => setCreateTaskModalOpen(false)}
          onTaskCreated={() => {
            setCreateTaskModalOpen(false);
            reload();
          }}
          contactId={leadId || undefined}
          replyThreadId={data?.thread_id || undefined}
          campaignId={campaignId || undefined}
          defaultPriority="high"
          defaultDueDate={new Date(Date.now() + 24 * 60 * 60 * 1000)} // Tomorrow
        />
      </SheetContent>
    </Sheet>
  );
}

