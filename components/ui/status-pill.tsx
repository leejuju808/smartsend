export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-blue-100 text-blue-700",
    sending: "bg-sky-100 text-sky-700",
    sent: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
    replied: "bg-purple-100 text-purple-700",
    canceled: "bg-zinc-100 text-zinc-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-zinc-100 text-zinc-700"}`}>
      {status}
    </span>
  );
}
