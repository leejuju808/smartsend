"use client";

const LABELS = ["positive", "neutral", "question", "negative", "unsubscribe", "out_of_office", "unknown"] as const;

type ConfusionRow = { ai_intent: string; human_intent: string; cnt: number };

export function ConfusionTable({ rows }: { rows: ConfusionRow[] }) {
  const grid: Record<string, Record<string, number>> = {};
  for (const ai of LABELS) {
    grid[ai] = {};
    for (const human of LABELS) {
      grid[ai][human] = 0;
    }
  }

  rows.forEach((row) => {
    const ai = row.ai_intent ?? "unknown";
    const human = row.human_intent ?? "unknown";
    if (!grid[ai]) {
      grid[ai] = Object.fromEntries(LABELS.map((label) => [label, 0]));
    }
    if (grid[ai][human] == null) {
      grid[ai][human] = 0;
    }
    grid[ai][human] = row.cnt;
  });

  return (
    <div className="overflow-auto rounded-2xl border p-4">
      <div className="mb-3 text-sm font-semibold">Confusion Matrix (AI vs Human)</div>
      <table className="min-w-[720px] border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left dark:bg-zinc-950">AI \\ Human</th>
            {LABELS.map((label) => (
              <th key={label} className="px-2 py-1">
                {short(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LABELS.map((ai) => (
            <tr key={ai}>
              <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left dark:bg-zinc-950">{short(ai)}</th>
              {LABELS.map((human) => {
                const value = grid[ai][human] ?? 0;
                const strong = ai === human && value > 0;
                return (
                  <td key={`${ai}-${human}`} className={`px-2 py-1 text-center ${strong ? "font-semibold" : ""}`}>
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function short(intent: string) {
  if (intent === "out_of_office") return "OOO";
  return intent ? intent[0].toUpperCase() + intent.slice(1) : "Unknown";
}

