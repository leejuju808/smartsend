"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HeaderBadges } from "./HeaderBadges";
import { HeaderChips } from "./HeaderChips";
import { AssignDropdown } from "./AssignDropdown";
import { SmartActions } from "./SmartActions";
import { ReplyMarkButtons } from "./ReplyMarkButtons";
import { ReplyStatusBadge } from "./components/ReplyStatusBadge";
import { ThreadActions } from "./components/ThreadActions";
import { ThreadAssistant } from "./components/ThreadAssistant";
import { MeetingAction } from "./MeetingAction";
import type { ReplyStatus } from "@/lib/replies";

type ThreadHeaderControlsProps = {
  repliedAt?: string | null;
  pausedUntil?: string | null;
  pausedReason?: string | null;
  lastReplyIntent?: string | null;
  leadId: string;
  campaignId: string;
  threadId: string;
  assignedTo?: string | null;
  isLeadPaused: boolean;
  isSuppressed: boolean;
  aiIntent?: string | null;
  needsReview?: boolean;
  isReplied?: boolean | null;
  leadMuted?: boolean;
  replyStatus?: {
    intent: ReplyStatus | null;
    subtype: string | null;
    confidence: number | null;
    created_at: string | null;
    autoPaused: boolean;
    resume_at?: string | null;
    lead_id?: string | null;
  };
  meetingIntentId?: string | null;
  latestInboundMessageId?: string | null;
};

export function ThreadHeaderControls({
  repliedAt,
  pausedUntil,
  pausedReason,
  lastReplyIntent,
  leadId,
  campaignId,
  threadId,
  assignedTo,
  isLeadPaused,
  isSuppressed,
  aiIntent,
  needsReview,
  isReplied,
  leadMuted,
  replyStatus,
  meetingIntentId,
  latestInboundMessageId,
}: ThreadHeaderControlsProps) {
  const router = useRouter();
  const [localPausedUntil, setLocalPausedUntil] = React.useState(pausedUntil ?? null);
  const [localPausedReason, setLocalPausedReason] = React.useState(pausedReason ?? null);
  const [localIsPaused, setLocalIsPaused] = React.useState(isLeadPaused);
  const [assignee, setAssignee] = React.useState<string | null>(assignedTo ?? null);
  const [suppressed, setSuppressed] = React.useState(isSuppressed);

  React.useEffect(() => {
    setLocalPausedUntil(pausedUntil ?? null);
  }, [pausedUntil]);

  React.useEffect(() => {
    setLocalPausedReason(pausedReason ?? null);
  }, [pausedReason]);

  React.useEffect(() => {
    setLocalIsPaused(isLeadPaused);
  }, [isLeadPaused]);

  React.useEffect(() => {
    setAssignee(assignedTo ?? null);
  }, [assignedTo]);

  React.useEffect(() => {
    setSuppressed(isSuppressed);
  }, [isSuppressed]);

  const handleResumed = React.useCallback(() => {
    setLocalPausedUntil(null);
    setLocalPausedReason(null);
    setLocalIsPaused(false);
    setSuppressed(false);
  }, []);

  const handleSuppressed = React.useCallback(() => {
    setSuppressed(true);
  }, []);

  const handleAssignmentChange = React.useCallback(
    (next: string | null) => {
      setAssignee(next);
      router.refresh();
    },
    [router],
  );

  const repliedFlag = typeof isReplied === "boolean" ? isReplied : Boolean(repliedAt);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <HeaderBadges
            replied_at={repliedAt ?? null}
            paused_until={localPausedUntil}
            paused_reason={localPausedReason}
            last_reply_intent={lastReplyIntent ?? null}
            is_paused={localIsPaused}
            is_suppressed={suppressed}
            thread_id={threadId}
          />
          {latestInboundMessageId ? <HeaderChips messageId={latestInboundMessageId} /> : null}
          <AssignDropdown
            campaignId={campaignId}
            threadId={threadId}
            value={assignee}
            onChange={handleAssignmentChange}
          />
          <ReplyMarkButtons threadId={threadId} isReplied={repliedFlag} />
        </div>
        <div className="flex flex-col items-end gap-2">
          {meetingIntentId ? <MeetingAction intentId={meetingIntentId} /> : null}
          {replyStatus ? (
            <ReplyStatusBadge
              intent={replyStatus.intent}
              subtype={replyStatus.subtype}
              confidence={replyStatus.confidence}
              autoPaused={replyStatus.autoPaused}
            />
          ) : null}
        </div>
      </div>
      <SmartActions
        threadId={threadId}
        leadId={leadId}
        isSuppressed={suppressed}
        isLeadPaused={localIsPaused}
        aiIntent={aiIntent ?? null}
        needsReview={needsReview ?? false}
        onResume={handleResumed}
        onSuppressed={handleSuppressed}
      />
      <ThreadActions
        threadId={threadId}
        leadId={leadId}
        autoPaused={replyStatus?.autoPaused ?? false}
        isMuted={Boolean(leadMuted)}
      />
      <ThreadAssistant threadId={threadId} />
    </div>
  );
}

