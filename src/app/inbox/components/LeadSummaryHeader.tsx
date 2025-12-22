"use client";

import { Thread } from "../page";
import { IntentBadge } from "./IntentBadge";
import { colors } from "../constants/colors";

interface LeadSummaryHeaderProps {
  thread: Thread;
}

export function LeadSummaryHeader({ thread }: LeadSummaryHeaderProps) {
  const location = [thread.contactCity, thread.contactState]
    .filter(Boolean)
    .join(", ");

  const callNotes = thread.callNotes || null;
  const hasCallNotes = Boolean(
    callNotes?.address || callNotes?.issueType || callNotes?.urgency
  );

  return (
    <div className="space-y-4">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 
            className="text-2xl font-semibold mb-1"
            style={{ color: colors.ink }}
          >
            {thread.contactName}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {thread.contactEmail && (
              <span style={{ color: colors.inkSecondary }}>
                {thread.contactEmail}
              </span>
            )}
            {location && (
              <>
                {thread.contactEmail && (
                  <span style={{ color: colors.divider }}>•</span>
                )}
                <span style={{ color: colors.inkSecondary }}>
                  {location}
                </span>
              </>
            )}
          </div>
          {thread.intent ? (
            <p className="mt-1 text-[10px]" style={{ color: colors.inkSecondary }}>
              Lead categorized by SmartSend
            </p>
          ) : null}
          {hasCallNotes && (
            <div className="mt-2 text-xs" style={{ color: colors.inkSecondary }}>
              <span className="font-medium" style={{ color: colors.ink }}>
                Call notes
              </span>
              {callNotes?.address ? (
                <>
                  <span style={{ color: colors.divider }}> • </span>
                  <span>Address: {callNotes.address}</span>
                </>
              ) : null}
              {callNotes?.issueType ? (
                <>
                  <span style={{ color: colors.divider }}> • </span>
                  <span>Issue: {callNotes.issueType.replace(/_/g, " ")}</span>
                </>
              ) : null}
              {callNotes?.urgency ? (
                <>
                  <span style={{ color: colors.divider }}> • </span>
                  <span>Urgency: {callNotes.urgency}</span>
                </>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <IntentBadge intent={thread.intent} size="md" />
          {thread.leadScore !== null && (
            <span
              className="text-xs px-3 py-1 rounded-full font-semibold border"
              style={{
                backgroundColor: colors.primaryLight,
                color: colors.primary,
                borderColor: colors.primary,
              }}
            >
              {thread.leadScore}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

