"use client";

export function SenderHealthBadge({ health }: { health: "green" | "yellow" | "red" }) {
  const base = "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium";
  if (health === "green") return <span className={`${base} bg-green-50 text-green-700`}>● Healthy</span>;
  if (health === "yellow") return <span className={`${base} bg-yellow-50 text-yellow-700`}>● Watchlist</span>;
  return <span className={`${base} bg-red-50 text-red-700`}>● Risk</span>;
}