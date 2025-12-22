// Block 21380 — SmartSend Roofing Job Health Score v1
// LeadScoreBadge: always shows numeric score + color

import React from "react";

type Props = {
  scoreTotal?: number | null;
};

function getScoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-gray-700 text-gray-100"; // unknown / not scored yet
  if (score >= 80) return "bg-emerald-600 text-white";   // high intent
  if (score >= 60) return "bg-amber-500 text-black";     // medium intent
  return "bg-red-600 text-white";                        // low intent
}

function getScoreLabel(score: number | null | undefined): string {
  if (score == null) return "--"; // always show *something*
  return String(score);
}

export const LeadScoreBadge: React.FC<Props> = ({ scoreTotal }) => {
  const colorClass = getScoreColor(scoreTotal);
  const label = getScoreLabel(scoreTotal);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${colorClass}`}
      title="Roofing Job Health Score (0–100)"
    >
      {label}
    </span>
  );
};















































