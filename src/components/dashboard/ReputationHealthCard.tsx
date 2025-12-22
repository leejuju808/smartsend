"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TrendPoint = { date: string; score: number };

type MailboxHealth = {
  email: string;
  reputation_score: number;
  send_limit: number;
  paused: boolean;
  last_update: string;
  status: { emoji: string; label: string };
  metrics: {
    open_rate: number;
    reply_rate: number;
    bounce_rate: number;
    complaint_rate: number;
    window: {
      sent: number;
      delivered: number;
      opened: number;
      replied: number;
      bounced: number;
      complaints: number;
    };
  };
  trend: TrendPoint[];
};

type ApiResponse = {
  mailboxes: MailboxHealth[];
  error?: string;
};

type ApiUpdateResponse = {
  mailbox?: MailboxHealth;
  error?: string;
};

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(date: string) {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  const width = 140;
  const height = 40;
  const padding = 4;
  const values = points.map((p) => p.score);
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step =
    points.length > 1
      ? (width - padding * 2) / (points.length - 1)
      : width / 2;
  const coords = points.map((p, idx) => {
    const x = padding + idx * step;
    const normalized = (p.score - min) / range;
    const y = height - padding - normalized * (height - padding * 2);
    return `${x},${y}`;
  });

  const lastPoint = coords[coords.length - 1]?.split(",").map(Number);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-32 h-10 text-gray-400"
      role="img"
      aria-label="7 day reputation trend"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={coords.join(" ")}
        className="text-gray-400"
      />
      {lastPoint && (
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r="3"
          className="fill-current text-black"
        />
      )}
    </svg>
  );
}

export function ReputationHealthCard() {
  const [data, setData] = useState<MailboxHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, number>>({});
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  const selectedMailbox = useMemo(
    () => data.find((row) => row.email === selectedEmail) ?? null,
    [data, selectedEmail]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reputation/health", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        throw new Error(json.error || "Failed to load mailbox health");
      }
      setData(json.mailboxes ?? []);
      const defaults: Record<string, number> = {};
      for (const row of json.mailboxes ?? []) {
        defaults[row.email] = row.send_limit ?? 0;
      }
      setLimitDrafts(defaults);
    } catch (err: any) {
      setError(err.message ?? "Failed to load mailbox health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const applyUpdate = useCallback(
    async (payload: { email: string; send_limit?: number; paused?: boolean }) => {
      setSavingEmail(payload.email);
      try {
        const res = await fetch("/api/reputation/mailbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as ApiUpdateResponse;
        if (!res.ok) {
          throw new Error(json.error || "Update failed");
        }
        if (json.mailbox) {
          await fetchData();
        }
      } catch (err: any) {
        setError(err.message ?? "Update failed");
      } finally {
        setSavingEmail(null);
      }
    },
    [fetchData]
  );

  const handleLimitBlur = useCallback(
    (email: string) => {
      const draft = limitDrafts[email];
      if (draft === undefined) return;
      const mailbox = data.find((row) => row.email === email);
      if (!mailbox) return;
      if (draft === mailbox.send_limit) return;
      void applyUpdate({ email, send_limit: draft });
    },
    [applyUpdate, data, limitDrafts]
  );

  const handleResume = useCallback(
    (email: string) => {
      void applyUpdate({ email, paused: false });
    },
    [applyUpdate]
  );

  const isEmpty = !loading && data.length === 0;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reputation Health</h2>
          <p className="text-sm text-gray-500">
            Daily scores, send caps, and auto-pause guards per mailbox.
          </p>
        </div>
        <button
          onClick={() => void fetchData()}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
          disabled={loading}
        >
          Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Mailbox
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Score
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Limit
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Trend (7d)
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  Loading reputation metrics…
                </td>
              </tr>
            )}
            {isEmpty && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  No mailboxes tracked yet. Run a campaign to populate metrics.
                </td>
              </tr>
            )}
            {!loading &&
              data.map((row) => (
                <tr
                  key={row.email}
                  className={classNames(
                    "cursor-pointer transition hover:bg-gray-50",
                    selectedEmail === row.email ? "bg-gray-50" : ""
                  )}
                  onClick={() =>
                    setSelectedEmail((prev) => (prev === row.email ? null : row.email))
                  }
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.email}</div>
                    <div className="text-xs text-gray-500">
                      Updated {new Date(row.last_update).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    {row.reputation_score.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      <span>{row.status.emoji}</span>
                      {row.status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={limitDrafts[row.email] ?? row.send_limit ?? 0}
                        onChange={(event) =>
                          setLimitDrafts((prev) => ({
                            ...prev,
                            [row.email]: Number(event.target.value),
                          }))
                        }
                        onBlur={() => handleLimitBlur(row.email)}
                        onClick={(event) => event.stopPropagation()}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-gray-500">/ day</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Sparkline points={row.trend} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.paused ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleResume(row.email);
                        }}
                        disabled={savingEmail === row.email}
                        className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingEmail === row.email ? "Resuming..." : "Resume sending"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">Auto</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selectedMailbox && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {selectedMailbox.email}
              </h3>
              <p className="text-sm text-gray-500">
                7-day summary · {selectedMailbox.status.emoji} {selectedMailbox.status.label}
              </p>
            </div>
            <button
              className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-500"
              onClick={() => setSelectedEmail(null)}
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Metric label="Open rate" value={percent(selectedMailbox.metrics.open_rate)} />
            <Metric label="Reply rate" value={percent(selectedMailbox.metrics.reply_rate)} />
            <Metric
              label="Bounce rate"
              value={percent(selectedMailbox.metrics.bounce_rate)}
              tone="danger"
            />
            <Metric
              label="Complaint rate"
              value={percent(selectedMailbox.metrics.complaint_rate)}
              tone="danger"
            />
          </div>

          <div className="mt-6">
            <h4 className="text-xs font-semibold uppercase text-gray-500">Daily score</h4>
            <div className="mt-2">
              <Sparkline points={selectedMailbox.trend} />
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              {selectedMailbox.trend.map((point) => (
                <span key={point.date}>
                  {formatDate(point.date)} · {point.score.toFixed(0)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-red-600 bg-red-50 border-red-100"
      : "text-gray-900 bg-gray-50 border-gray-100";
  return (
    <div className={classNames("rounded-xl border px-4 py-3", color)}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}


