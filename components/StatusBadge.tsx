export default function StatusBadge({ status }: { status: "queued" | "sending" | "sent" | "failed" }) {
  const base = "px-2 py-0.5 rounded-full text-xs font-medium";
  const map = {
    queued: "bg-gray-800 text-gray-200 border border-gray-700",
    sending: "bg-blue-900/50 text-blue-200 border border-blue-700",
    sent: "bg-green-900/50 text-green-200 border border-green-700",
    failed: "bg-red-900/50 text-red-200 border border-red-700",
  } as const;
  return <span className={`${base} ${map[status]}`}>{status}</span>;
}