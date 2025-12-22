// IntentBadge component for displaying reply intent labels
"use client";

export type ReplyIntent =
  | "interested"
  | "not_interested"
  | "neutral"
  | "out_of_office"
  | "unsubscribe"
  | "bounce"
  | "other"
  | null
  | undefined;

export function IntentBadge({ intent }: { intent?: ReplyIntent }) {
  if (!intent) return null;

  const map: Record<string, { label: string; className: string }> = {
    interested: { label: "Interested", className: "bg-green-100 text-green-700" },
    not_interested: { label: "Not interested", className: "bg-red-100 text-red-700" },
    neutral: { label: "Neutral", className: "bg-slate-100 text-slate-700" },
    out_of_office: { label: "OOO", className: "bg-yellow-100 text-yellow-800" },
    unsubscribe: { label: "Unsubscribed", className: "bg-zinc-900 text-zinc-50" },
    bounce: { label: "Bounce", className: "bg-orange-100 text-orange-700" },
    other: { label: "Other", className: "bg-slate-100 text-slate-700" },
  };

  const cfg = map[intent] || map.other;

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}


































































