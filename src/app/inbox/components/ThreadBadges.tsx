"use client";

import { OOOChip } from "./OOOChip";
import { LabelBadge, type ThreadLabel } from "./LabelBadge";

export function ThreadBadges({
  label,
  snoozedUntil,
  hasActiveOOO,
  resumeAfter,
  oooPreview,
}: {
  label: ThreadLabel;
  snoozedUntil: string | null;
  hasActiveOOO: boolean;
  resumeAfter: string | null;
  oooPreview?: string | null;
}) {
  const isPaused =
    typeof snoozedUntil === "string" &&
    !Number.isNaN(Date.parse(snoozedUntil)) &&
    Date.parse(snoozedUntil) > Date.now();

  const active = hasActiveOOO || isPaused;
  const resume = resumeAfter ?? snoozedUntil;

  return (
    <div className="flex items-center gap-2">
      <LabelBadge label={label} />
      {active && (
        <OOOChip resumeAfter={resume} active={active} cleanPreview={oooPreview ?? undefined} />
      )}
    </div>
  );
}

