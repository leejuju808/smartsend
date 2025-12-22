"use client";

import { Badge } from "@/components/ui/badge";

type Props = {
  aiCategory?: string | null;
  aiHasMeeting?: boolean | null;
  aiStopFollowups?: boolean | null;
};

export function ReplyIntentBadges({
  aiCategory,
  aiHasMeeting,
  aiStopFollowups,
}: Props) {
  const category = aiCategory?.toLowerCase() || null;

  // Handle both naming conventions: "positive"/"interested", "negative"/"not_interested", etc.
  const normalizedCategory =
    category === "interested" || category === "positive"
      ? "positive"
      : category === "not_interested" || category === "negative"
      ? "negative"
      : category === "out_of_office" || category === "ooo" || category === "oop"
      ? "oop"
      : category;

  const categoryLabel =
    normalizedCategory === "positive"
      ? "Interested"
      : normalizedCategory === "negative"
      ? "Not interested"
      : normalizedCategory === "neutral"
      ? "Neutral"
      : normalizedCategory === "oop"
      ? "Out of office"
      : normalizedCategory === "spam"
      ? "Spam"
      : category; // Fallback to original if not mapped

  const categoryClass =
    normalizedCategory === "positive"
      ? "bg-emerald-900/80 border-emerald-600"
      : normalizedCategory === "negative"
      ? "bg-rose-900/80 border-rose-600"
      : normalizedCategory === "oop"
      ? "bg-sky-900/80 border-sky-600"
      : normalizedCategory === "spam"
      ? "bg-slate-900/80 border-slate-600"
      : "bg-slate-900/80 border-slate-700";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {categoryLabel && (
        <Badge className={`${categoryClass} text-[10px]`}>
          {categoryLabel}
        </Badge>
      )}

      {aiHasMeeting && (
        <Badge className="bg-amber-900/80 border-amber-600 text-[10px]">
          Has meeting intent
        </Badge>
      )}

      {aiStopFollowups && (
        <Badge className="bg-rose-900/80 border-rose-600 text-[10px]">
          Stop followups
        </Badge>
      )}
    </div>
  );
}

