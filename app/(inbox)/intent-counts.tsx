"use client";

import useSWR from "swr";

const ALL_INTENTS = [
  "positive",
  "neutral",
  "question",
  "negative",
  "unsubscribe",
  "out_of_office",
  "unknown",
] as const;

type Intent = (typeof ALL_INTENTS)[number];

export function IntentCounts({ selected }: { selected: string[] }) {
  const params = new URLSearchParams();
  if (selected.length) {
    params.set("intent", selected.join(","));
  }
  const qs = params.toString();
  const { data } = useSWR(`/api/inbox/intent-counts${qs ? `?${qs}` : ""}`, (url: string) =>
    fetch(url).then((res) => res.json()),
  );

  const counts: Record<string, number> = data?.counts ?? {};

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_INTENTS.map((key) => (
        <span key={key} className="rounded-full border px-2 py-1 text-xs">
          {formatLabel(key)}: {counts[key] ?? 0}
        </span>
      ))}
    </div>
  );
}

function formatLabel(intent: Intent) {
  if (intent === "out_of_office") {
    return "OOO";
  }
  return intent.charAt(0).toUpperCase() + intent.slice(1);
}





