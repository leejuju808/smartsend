export function ReplyIntentBadge({ intent }: { intent?: string | null }) {
  const map: Record<string, string> = {
    positive: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    neutral: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    negative: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    ooo: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    unsubscribe: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  };
  const cls = map[intent ?? 'neutral'] ?? map.neutral;
  return <span className={`px-2 py-0.5 text-xs border rounded-full ${cls}`}>{intent ?? 'neutral'}</span>;
}

