export function ReplyBadge({ intent }: { intent: string }) {
  const map: Record<string, string> = {
    interested: "bg-emerald-100 text-emerald-700",
    scheduling: "bg-indigo-100 text-indigo-700",
    referral: "bg-cyan-100 text-cyan-700",
    neutral: "bg-gray-100 text-gray-700",
    not_interested: "bg-rose-100 text-rose-700",
    unsubscribe: "bg-amber-100 text-amber-800",
    ooo: "bg-yellow-100 text-yellow-800",
    spam: "bg-slate-200 text-slate-700",
    unknown: "bg-gray-100 text-gray-700",
  };
  return <span className={`px-2 py-1 rounded-full text-xs ${map[intent] || map.unknown}`}>{intent.replace("_"," ")}</span>;
}