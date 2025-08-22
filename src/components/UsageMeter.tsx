"use client";
import { useEffect, useState } from "react";

type Policy = {
  plan: "free"|"pro"|string;
  limit: number;
  usedToday: number;
  remaining: number;
  atCap: boolean;
  quiet?: { active: boolean; resumeAtISO?: string };
};

export default function UsageMeter({ userId, compact=false }: { userId: string; compact?: boolean }) {
  const [p, setP] = useState<Policy | null>(null);
  const [refLink, setRefLink] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/sending/policy?userId=${userId}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setP(j);
    if (j?.plan === "free") {
      fetch(`/api/referrals/link?userId=${userId}`).then(r=>r.json()).then(j=>setRefLink(j?.link ?? null)).catch(()=>{});
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  if (!p) return <div className="rounded-2xl border p-3 bg-white text-sm">Loading usage…</div>;

  const used = Math.min(p.usedToday, p.limit);
  const pct = p.limit ? Math.round((used / p.limit) * 100) : 0;
  const warn = pct >= 80 && pct < 100;
  const capped = p.atCap || pct >= 100;

  return (
    <div className={`rounded-2xl border p-4 bg-white ${compact ? "":"max-w-2xl"}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">Daily sends</div>
        <div className="text-xs px-2 py-1 rounded-full bg-gray-100">Plan: {p.plan}</div>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>{used}/{p.limit} used</div>
        <div className={`font-medium ${capped ? "text-red-700" : warn ? "text-amber-700" : "text-gray-700"}`}>{pct}%</div>
      </div>
      <div className="mt-2 h-3 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-3 ${capped ? "bg-red-500" : warn ? "bg-amber-500" : "bg-black"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      {p.quiet?.active && (
        <div className="mt-2 text-xs text-blue-800 bg-blue-50 rounded-xl px-3 py-2">
          Quiet hours are active. Sending resumes around {p.quiet.resumeAtISO ? new Date(p.quiet.resumeAtISO).toLocaleTimeString() : "the next window"}.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {capped ? (
          <>
            <a href="/dashboard/billing/upgrade" className="rounded-xl bg-black text-white px-3 py-1.5 text-sm">
              Upgrade to Pro
            </a>
            {refLink && (
              <a href={refLink} className="rounded-xl bg-green-600 text-white px-3 py-1.5 text-sm" target="_blank">
                Get a free month (Invite)
              </a>
            )}
            <span className="text-xs text-gray-600">You’ve hit today’s cap.</span>
          </>
        ) : warn ? (
          <>
            <a href="/dashboard/billing/upgrade" className="rounded-xl bg-black text-white px-3 py-1.5 text-sm">
              Nearly capped — Upgrade
            </a>
            {refLink && <a href={refLink} className="rounded-xl bg-green-600 text-white px-3 py-1.5 text-sm" target="_blank">Invite friend</a>}
            <span className="text-xs text-gray-600">{p.remaining} sends left today.</span>
          </>
        ) : (
          <span className="text-xs text-gray-600">{p.remaining} sends left today.</span>
        )}
      </div>
    </div>
  );
}