// Block 21977 — SmartSend Roofing Win/Loss Reason Badge Component
// Displays win/loss reason badges on lead cards and detail views

"use client";

interface ReasonBadgeProps {
  reason: string | null | undefined;
  status: "won" | "lost" | string;
  confidence?: number | null;
  className?: string;
}

export function ReasonBadge({ reason, status, confidence, className = "" }: ReasonBadgeProps) {
  if (!reason) return null;

  const isWon = status === "won";
  const colorClass = isWon
    ? "bg-green-600 text-white border-green-700"
    : "bg-red-600 text-white border-red-700";

  const confidenceBadge = confidence !== null && confidence !== undefined && confidence < 70 ? (
    <span className="ml-1 text-xs opacity-75">({confidence}%)</span>
  ) : null;

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium border ${colorClass} ${className}`}
      title={confidence !== null && confidence !== undefined ? `Confidence: ${confidence}%` : undefined}
    >
      {reason}
      {confidenceBadge}
    </span>
  );
}









































