type LabelChipProps = {
  label?: string | null;
};

export function LabelChip({ label }: LabelChipProps) {
  if (!label) return null;

  const map: Record<string, string> = {
    human_reply: "bg-emerald-500/20 text-emerald-300",
    question: "bg-blue-500/20 text-blue-300",
    positive: "bg-emerald-500/20 text-emerald-300",
    neutral: "bg-zinc-500/20 text-zinc-300",
    negative: "bg-rose-500/20 text-rose-300",
    ooo: "bg-amber-500/20 text-amber-300",
    unsubscribe: "bg-rose-500/20 text-rose-300",
    spam: "bg-purple-500/20 text-purple-300",
    bounce: "bg-rose-500/20 text-rose-300",
    other: "bg-zinc-500/20 text-zinc-300",
  };

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${map[label] ?? map.other}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}



