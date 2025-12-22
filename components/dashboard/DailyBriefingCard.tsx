"use client";

// Block 21738 — SmartSend Roofing Owner Daily Briefing v1
// Daily Briefing Card Component

import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";

type Briefing = {
  generated_at: string;
  new_hot_leads_count: number;
  new_hot_leads: {
    id: string;
    name: string | null;
    email: string | null;
    city: string | null;
    heat_score: number | null;
    last_activity_at: string | null;
  }[];
  today_appointments_count: number;
  today_appointments: {
    id: string;
    scheduled_for: string;
    source: string;
    name: string | null;
    email: string | null;
    city: string | null;
    heat_score: number | null;
  }[];
  call_queue_pending: number;
  call_queue_pending_hot: number;
  new_replies_24h: number;
  projected_revenue: number;
};

export function DailyBriefingCard() {
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daily-briefing")
      .then((r) => r.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load daily briefing:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
        Loading today&apos;s briefing…
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-transparent border border-yellow-500/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-yellow-300 tracking-wide">
            Today&apos;s Money Snapshot
          </div>
          <div className="text-[11px] text-gray-300">
            Updated{" "}
            {formatDistanceToNow(new Date(data.generated_at), {
              addSuffix: true,
            })}
          </div>
        </div>
        <div className="text-right text-xs text-gray-300">
          Projected Revenue
          <div className="text-lg font-bold text-yellow-300">
            ${data.projected_revenue.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Row of key stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <StatPill
          label="New HOT leads (24h)"
          value={data.new_hot_leads_count}
          highlight
        />
        <StatPill
          label="Appointments today"
          value={data.today_appointments_count}
        />
        <StatPill
          label="Calls in queue"
          value={data.call_queue_pending}
          sub={`${data.call_queue_pending_hot} HOT`}
        />
        <StatPill
          label="New replies (24h)"
          value={data.new_replies_24h}
        />
      </div>

      {/* Hottest new leads + today's appointments */}
      <div className="grid md:grid-cols-2 gap-4 text-xs">
        <div>
          <div className="text-[11px] text-gray-300 mb-1">
            🔥 New HOT leads to hit first
          </div>
          {data.new_hot_leads.length === 0 && (
            <div className="text-[11px] text-gray-500">
              No new hot leads in the last 24 hours.
            </div>
          )}
          <div className="space-y-1">
            {data.new_hot_leads.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-lg bg-black/40 border border-white/10 px-2 py-1.5"
              >
                <div>
                  <div className="text-[12px] text-white">
                    {l.name || l.email || "Homeowner"}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {l.city || "Unknown city"} •{" "}
                    {l.last_activity_at
                      ? formatDistanceToNow(new Date(l.last_activity_at), {
                          addSuffix: true,
                        })
                      : "recent"}
                  </div>
                </div>
                <div className="text-[11px] text-yellow-300 font-semibold">
                  HS {l.heat_score ?? 0}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-gray-300 mb-1">
            🗓 Today&apos;s appointments
          </div>
          {data.today_appointments.length === 0 && (
            <div className="text-[11px] text-gray-500">
              No appointments scheduled today.
            </div>
          )}
          <div className="space-y-1">
            {data.today_appointments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg bg-black/40 border border-white/10 px-2 py-1.5"
              >
                <div>
                  <div className="text-[12px] text-white">
                    {a.name || a.email || "Homeowner"}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {a.city || "Unknown city"} •{" "}
                    {format(new Date(a.scheduled_for), "h:mm a")}
                  </div>
                </div>
                <div className="text-[11px] text-gray-300">
                  HS {a.heat_score ?? 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-gray-400">
        Open SmartSend each morning, glance at this card, and you&apos;ll know
        exactly who to call and where your crews are headed.
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 border text-xs ${
        highlight
          ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-100"
          : "border-white/10 bg-black/40 text-gray-200"
      }`}
    >
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}










































