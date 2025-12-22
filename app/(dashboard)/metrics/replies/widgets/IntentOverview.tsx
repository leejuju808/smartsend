"use client";

type IntentOverviewRow = { intent: string; cnt: number };

export function IntentOverview({ data }: { data: IntentOverviewRow[] }) {
  const total = data.reduce((sum, row) => sum + row.cnt, 0);
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-2 text-sm font-semibold">Distribution by intent (30d)</div>
      <div className="grid gap-2 md:grid-cols-3">
        {data.map((row) => (
          <div key={row.intent} className="flex items-center justify-between rounded-xl border px-3 py-2">
            <span className="text-sm">{label(row.intent)}</span>
            <span className="text-sm font-mono">
              {row.cnt} <span className="text-xs text-zinc-500">({pct(row.cnt, total)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function pct(n: number, t: number) {
  return t ? Math.round((n * 100) / t) : 0;
}

function label(intent: string) {
  if (intent === "out_of_office") return "OOO";
  return intent ? intent[0].toUpperCase() + intent.slice(1) : "Unknown";
}





