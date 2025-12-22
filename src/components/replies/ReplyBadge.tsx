export function ReplyBadge({ label }: { label?: string }) {
  const map: Record<string, string> = {
    human: "bg-green-100 text-green-800",
    ooo: "bg-yellow-100 text-yellow-800",
    unsubscribe: "bg-red-100 text-red-800",
    bounce: "bg-gray-100 text-gray-800",
    spam: "bg-orange-100 text-orange-800",
    unknown: "bg-slate-100 text-slate-800",
  };
  const cls = map[label || "unknown"] || map.unknown;
  return <span className={`px-2 py-1 rounded text-xs font-medium ${cls}`}>{label || "unknown"}</span>;
}
