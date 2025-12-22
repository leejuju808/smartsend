"use client";

import { ThreadBadges } from "../components/ThreadBadges";
import type { ThreadLabel } from "../components/LabelBadge";
import { ReclassifyDropdown } from "./ReclassifyDropdown";

export function ThreadHeaderBadges({
  threadId,
  label,
  snoozedUntil,
  hasActiveOOO,
  resumeAfter,
  oooPreview,
}: {
  threadId: string;
  label: ThreadLabel;
  snoozedUntil: string | null;
  hasActiveOOO: boolean;
  resumeAfter: string | null;
  oooPreview?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <ThreadBadges
        label={label}
        snoozedUntil={snoozedUntil}
        hasActiveOOO={hasActiveOOO}
        resumeAfter={resumeAfter}
        oooPreview={oooPreview}
      />
      {threadId && <ReclassifyDropdown threadId={threadId} current={label ?? undefined} />}
    </div>
  );
}

