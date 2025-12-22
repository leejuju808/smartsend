/**
 * Block 13800 — Lead Score Badge Component
 * Displays lead score with appropriate styling
 */

import { getLeadScoreCategory, getLeadScoreEmoji, getLeadScoreBadgeColor } from "@/lib/lead-scoring/contact-lead-score";

interface LeadScoreBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LeadScoreBadge({
  score,
  showLabel = true,
  size = "md",
  className = "",
}: LeadScoreBadgeProps) {
  const category = getLeadScoreCategory(score);
  const emoji = getLeadScoreEmoji(score);
  const colorClass = getLeadScoreBadgeColor(score);

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${colorClass} ${sizeClasses[size]} ${className}`}
      title={`Lead Score: ${score} (${category})`}
    >
      <span>{emoji}</span>
      {showLabel && (
        <>
          <span>{score}</span>
          <span className="hidden sm:inline">{category}</span>
        </>
      )}
    </span>
  );
}

/**
 * Compact badge (emoji + score only)
 */
export function LeadScoreBadgeCompact({ score }: { score: number }) {
  const emoji = getLeadScoreEmoji(score);
  return (
    <span
      className="inline-flex items-center gap-1 text-sm font-medium"
      title={`Lead Score: ${score}`}
    >
      <span>{emoji}</span>
      <span>{score}</span>
    </span>
  );
}





















































