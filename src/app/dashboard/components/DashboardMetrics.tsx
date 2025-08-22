"use client";
import { useEffect, useState } from "react";
import MetricCard from "./MetricCard";

type M = { scope: "overall" | "sequence"; sent: number; open: number; reply: number };

export default function DashboardMetrics({
  userId,
  sequenceId,
  onZeroState,
}: {
  userId: string;
  sequenceId?: string;
  onZeroState?: () => void;
}) {
  const [m, setM] = useState<M | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function fetchMetrics() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ userId, ...(sequenceId ? { sequenceId } : {}) });
      const r = await fetch(`/api/metrics?${q.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed");
      setM(j);
      if ((j.sent ?? 0) === 0 && onZeroState) onZeroState();
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sequenceId]);

  useEffect(() => {
    const onFocus = () => fetchMetrics()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sequenceId])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border p-4 bg-white">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (err) return <div className="text-red-600 text-sm">Metrics error: {err}</div>;
  if (!m) return null;

  const openRate = m.sent ? Math.round((m.open / m.sent) * 100) : 0;
  const replyRate = m.sent ? Math.round((m.reply / m.sent) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard label="Sent" value={m.sent} hint={m.scope === "sequence" ? "This sequence" : "All campaigns"} />
      <MetricCard label="Opened" value={m.open} hint={`${openRate}% open rate`} />
      <MetricCard label="Replied" value={m.reply} hint={`${replyRate}% reply rate`} />
    </div>
  );
}

