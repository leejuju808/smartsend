"use client";

type PausedBannerProps = {
  isPaused: boolean;
  reason?: string | null;
  until?: string | null;
};

const REASON_LABELS: Record<string, string> = {
  ooo: "Out of office reply",
  replied: "Recently replied",
  manual: "Paused manually",
  auto: "Paused automatically",
};

export function PausedBanner({ isPaused, reason, until }: PausedBannerProps) {
  if (!isPaused) {
    return null;
  }

  const label = reason ? REASON_LABELS[reason] ?? reason : "Paused";
  const untilLabel = until ? formatDateTime(until) : null;

  return (
    <div className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      Follow-ups are <b>Paused</b>
      {label ? (
        <>
          {" "}
          (<span className="font-medium">{label}</span>)
        </>
      ) : null}
      {untilLabel ? (
        <>
          {" — "}
          Auto-resumes {untilLabel}
        </>
      ) : null}
      . You can resume them manually when ready.
    </div>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
