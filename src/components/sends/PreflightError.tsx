"use client";

type PreflightErrorProps = {
  code: string;
  meta?: Record<string, unknown> | null;
};

const MESSAGE_MAP: Record<string, string> = {
  suppressed: "This contact is suppressed. Respect their preference.",
  "campaign-daily-cap": "Daily campaign send cap reached. Try tomorrow or raise the cap.",
  "account-daily-cap": "Your account hit the daily send cap.",
  "mailbox-not-ready": "Mailbox is still warming. Switch sender or wait until it's ready.",
  "mailbox-blocked": "Mailbox temporarily blocked due to health. Try later.",
  "dns-health-fail": "Domain DNS health failed (SPF/DKIM/MX). Fix DNS before sending.",
  "cadence-window": "Too soon to contact this lead again per cadence settings.",
  "office-hours-day": "Outside allowed days.",
  "office-hours-hour": "Outside allowed hours.",
};

function formatMeta(meta?: Record<string, unknown> | null): string[] {
  if (!meta) return [];

  const entries: string[] = [];

  if (meta.last_sent_at) {
    entries.push(`Last send: ${new Date(String(meta.last_sent_at)).toLocaleString()}`);
  }
  if (meta.min_minutes) {
    entries.push(`Minimum gap: ${meta.min_minutes} minutes`);
  }
  if (meta.until) {
    entries.push(`Retry after: ${new Date(String(meta.until)).toLocaleString()}`);
  }
  if (meta.stage) {
    entries.push(`Mailbox stage: ${meta.stage}`);
  }
  return entries;
}

export function PreflightError({ code, meta }: PreflightErrorProps) {
  const details = formatMeta(meta);

  return (
    <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      <div>{MESSAGE_MAP[code] ?? "Send blocked by preflight."}</div>
      {details.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-rose-700">
          {details.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}


