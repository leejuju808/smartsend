"use client";

// Block 21744 — SmartSend Roofing Hot Lead Accelerator v1
// Hot Lead Accelerator Card Component
// Shows speed-to-lead metrics and uncontacted hot leads

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type SpeedSummary = {
  since: string;
  total_hot: number;
  contacted: number;
  avg_time_to_first_contact: string | null;
  under_15_min: number;
  under_60_min: number;
  under_120_min: number;
  no_contact: number;
  uncontacted_hot_leads: {
    id: string;
    name: string | null;
    email: string | null;
    city: string | null;
    heat_score: number | null;
    first_hot_at: string;
  }[];
};

function formatInterval(i: string | null) {
  if (!i) return "N/A";
  // i is PG interval style: "00:34:12.123"
  const parts = i.split(":"); // [hours, minutes, seconds]
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);

  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

export function HotLeadAcceleratorCard() {
  const [data, setData] = useState<SpeedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/hot-leads/speed?days=${days}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load hot lead speed data:", err);
        setLoading(false);
      });
  }, [days]);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
        Calculating hot lead speed…
      </div>
    );
  }

  if (!data) return null;

  const contactRate =
    data.total_hot > 0 ? Math.round((data.contacted / data.total_hot) * 100) : 0;

  return (
    <div className="rounded-xl bg-white/5 border border-red-500/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-red-300">
            Hot Lead Accelerator
          </div>
          <div className="text-[11px] text-gray-400">
            Speed-to-lead over last {days} days
          </div>
        </div>

        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-black border border-white/10 text-xs text-gray-200 rounded-lg px-2 py-1"
        >
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
        </select>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Stat
          label="New HOT leads"
          value={data.total_hot}
          sub={`Contacted: ${data.contacted}`}
        />
        <Stat
          label="Avg time to first contact"
          value={formatInterval(data.avg_time_to_first_contact)}
        />
        <Stat
          label="Contacted within 1 hour"
          value={
            data.total_hot
              ? `${Math.round(
                  (data.under_60_min / data.total_hot) * 100
                )}%`
              : "0%"
          }
          sub={`${data.under_60_min}/${data.total_hot}`}
        />
        <Stat
          label="HOT leads with no contact"
          value={data.no_contact}
          highlight={data.no_contact > 0}
        />
      </div>

      {/* List of hot leads with no contact */}
      <div className="border-t border-white/10 pt-3">
        <div className="text-[11px] text-gray-300 mb-1">
          HOT leads that nobody has called yet
        </div>
        {data.uncontacted_hot_leads.length === 0 && (
          <div className="text-[11px] text-gray-500">
            You&apos;re on top of it — every hot lead in this window has been contacted.
          </div>
        )}

        <div className="space-y-1 max-h-48 overflow-y-auto">
          {data.uncontacted_hot_leads.map((l) => (
            <Link
              key={l.id}
              href={`/leads/${l.id}`}
              className="flex items-center justify-between rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-gray-200 hover:bg-black/70 transition-colors"
            >
              <div>
                <div className="font-semibold">
                  {l.name || l.email || "Homeowner"}
                </div>
                <div className="text-[10px] text-gray-400">
                  {l.city || "Unknown city"} • HOT since{" "}
                  {formatDistanceToNow(new Date(l.first_hot_at), {
                    addSuffix: true
                  })}
                </div>
              </div>
              <div className="text-[10px] text-yellow-300">
                HS {l.heat_score ?? 0}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-gray-500">
        Speed-to-lead matters: the faster you call, the more roofs you book. This
        card makes it impossible to ignore hot homeowners.
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 border text-xs ${
        highlight
          ? "border-red-500/70 bg-red-500/10 text-red-100"
          : "border-white/10 bg-black/40 text-gray-200"
      }`}
    >
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}










































