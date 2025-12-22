type AiBadgeProps = {
  label?: string | null;
  score?: number | null;
};

const CLASS_MAP: Record<string, string> = {
  meeting: "bg-emerald-100 text-emerald-700",
  positive: "bg-sky-100 text-sky-700",
  question: "bg-amber-100 text-amber-700",
  neutral: "bg-slate-100 text-slate-700",
  ooo: "bg-purple-100 text-purple-700",
  unsubscribe: "bg-rose-100 text-rose-700",
  bounce: "bg-rose-100 text-rose-700",
  spam: "bg-gray-100 text-gray-700",
};

export default function AiBadge({ label, score }: AiBadgeProps) {
  const normalized = String(label || "neutral").toLowerCase();
  const cls = CLASS_MAP[normalized] || CLASS_MAP.neutral;
  const pct = Number.isFinite(score) ? Math.round(Number(score) * 100) : null;

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-2xl ${cls}`}>
      {normalized}
      {pct !== null ? ` • ${pct}%` : ""}
    </span>
  );
}




