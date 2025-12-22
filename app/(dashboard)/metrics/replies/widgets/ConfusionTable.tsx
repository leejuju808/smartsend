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
    if (!grid[row.ai_intent]) grid[row.ai_intent] = {};
    if (grid[row.ai_intent][row.human_intent] == null) grid[row.ai_intent][row.human_intent] = 0;
    grid[row.ai_intent][row.human_intent] = row.cnt;
  });

  return (
    <div className="overflow-auto rounded-2xl border p-4">
      <div className="mb-3 text-sm font-semibold">Confusion Matrix (AI vs Human)</div>
      <table className="min-w-[720px] border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left dark:bg-zinc-950">AI \\ Human</th>
            {LABELS.map((human) => (
              <th key={human} className="px-2 py-1">
                {short(human)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LABELS.map((ai) => (
            <tr key={ai}>
              <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left dark:bg-zinc-950">{short(ai)}</th>
              {LABELS.map((human) => {
                const count = grid[ai][human] ?? 0;
                const strong = ai === human && count > 0;
                return (
                  <td key={`${ai}-${human}`} className={`px-2 py-1 text-center ${strong ? "font-semibold" : ""}`}>
                    {count}
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
  return intent === "out_of_office" ? "OOO" : intent[0].toUpperCase() + intent.slice(1);
}





