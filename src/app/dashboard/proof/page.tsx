"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ProofStackPayload = {
  workspace_id: string;
  as_of: string | null;
  emails_sent_all_time: number;
  replies_all_time: number;
  jobs_booked_all_time: number;
  estimated_value_all_time: number;
  jobs_closed_all_time?: number;
  revenue_closed_all_time?: number;
};

type HardEvidencePayload = {
  period: { month_start: string };
  top: {
    jobs_closed_this_month: number;
    estimated_revenue_won_this_month: number;
  };
  closed_jobs: Array<{
    job_id: string;
    closed_at: string | null;
    month: string | null;
    city: string | null;
    zip_code: string | null;
    originated_via_smartsend: boolean;
    before_photo_url: string | null;
    after_photo_url: string | null;
    estimated_revenue: number;
  }>;
};

type ProofSharePayload = { token: string | null; url: string | null };

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
      n || 0
    );
  } catch {
    return `$${Math.round(n || 0).toLocaleString()}`;
  }
}

function monthLabel(iso: string | null | undefined) {
  if (!iso) return "This month";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function StatCard(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{props.label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight">{props.value}</div>
      {props.sub ? <div className="mt-1 text-xs text-gray-500">{props.sub}</div> : null}
    </div>
  );
}

function PhotoCard({ url, label }: { url: string | null; label: string }) {
  if (!url) {
    return (
      <div className="rounded-xl border bg-gray-50 p-4 text-xs text-gray-500">
        No {label} photo
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-44 w-full object-cover" />
      <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
        Job originated via SmartSend
      </div>
      <div className="absolute top-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-gray-900">
        {label}
      </div>
    </div>
  );
}

export default function ProofPage() {
  const [proof, setProof] = useState<ProofStackPayload | null>(null);
  const [hard, setHard] = useState<HardEvidencePayload | null>(null);
  const [share, setShare] = useState<ProofSharePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const [p, h, s] = await Promise.all([
          fetch("/api/proof-stack", { cache: "no-store" }),
          fetch("/api/hard-evidence", { cache: "no-store" }),
          fetch("/api/proof-share", { cache: "no-store" }),
        ]);
        const pj = (await p.json().catch(() => null)) as ProofStackPayload | null;
        const hj = (await h.json().catch(() => null)) as HardEvidencePayload | null;
        const sj = (await s.json().catch(() => null)) as ProofSharePayload | null;
        if (!cancelled) {
          setProof(p.ok ? pj : null);
          setHard(h.ok ? hj : null);
          setShare(s.ok ? sj : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const asOf = useMemo(() => {
    const iso = proof?.as_of;
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return null;
    }
  }, [proof?.as_of]);

  const onCreateShare = async () => {
    const res = await fetch("/api/proof-share", { method: "POST" });
    const json = (await res.json().catch(() => null)) as ProofSharePayload | null;
    if (res.ok && json) setShare(json);
  };

  const onCopyShare = async () => {
    const url = share?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-72 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-28 bg-gray-200 rounded" />
            <div className="h-28 bg-gray-200 rounded" />
            <div className="h-28 bg-gray-200 rounded" />
          </div>
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">SmartSend Proof</h1>
          <div className="mt-1 text-sm text-gray-600">Physical evidence you can screenshot, print, and show.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
          <Button onClick={onCreateShare}>{share?.url ? "Refresh share link" : "Create share link"}</Button>
          {share?.url ? (
            <Button variant="outline" onClick={onCopyShare}>
              Copy link
            </Button>
          ) : null}
        </div>
      </div>

      {share?.url ? (
        <div className="mt-4 rounded-xl border bg-white p-4 print:hidden">
          <div className="text-xs font-semibold text-gray-900">Share link (no addresses)</div>
          <div className="mt-1 text-sm text-gray-600 break-all">{share.url}</div>
        </div>
      ) : null}

      {/* Month proof (always-visible KPI) */}
      <div className="mt-6">
        <div className="text-sm font-semibold text-gray-900">{monthLabel(hard?.period?.month_start || null)}</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            label="Jobs won this month"
            value={(hard?.top?.jobs_closed_this_month ?? 0).toLocaleString()}
            sub="Closed jobs (completed)"
          />
          <StatCard
            label="Estimated revenue won"
            value={formatMoney(hard?.top?.estimated_revenue_won_this_month ?? 0)}
            sub="From approved estimates linked to completed jobs"
          />
        </div>
      </div>

      {/* All-time proof stack */}
      <div className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">All-time proof</div>
            <div className="text-xs text-gray-500">{asOf ? `As of ${asOf}` : ""}</div>
          </div>
          <Link className="text-sm font-semibold text-blue-700 hover:underline print:hidden" href="/dashboard/revenue-proof">
            Revenue proof dashboard
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Emails sent" value={(proof?.emails_sent_all_time ?? 0).toLocaleString()} />
          <StatCard label="Replies" value={(proof?.replies_all_time ?? 0).toLocaleString()} />
          <StatCard label="Jobs booked" value={(proof?.jobs_booked_all_time ?? 0).toLocaleString()} />
          <StatCard label="Jobs closed" value={(proof?.jobs_closed_all_time ?? 0).toLocaleString()} />
          <StatCard label="Revenue closed" value={formatMoney(proof?.revenue_closed_all_time ?? 0)} />
          <StatCard label="Estimated value" value={formatMoney(proof?.estimated_value_all_time ?? 0)} />
        </div>
      </div>

      {/* Street-level proof + photos */}
      <div className="mt-10">
        <div className="text-sm font-semibold text-gray-900">Street-level proof (no addresses)</div>
        <div className="mt-1 text-xs text-gray-500">City • ZIP • month closed • optional before/after photos</div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(hard?.closed_jobs || []).slice(0, 12).map((j) => (
            <div key={j.job_id} className="rounded-2xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-gray-900">Job originated via SmartSend</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {(j.city || "—")} • {(j.zip_code || "—")} • {(j.month || "—")}
                  </div>
                </div>
                <div className="text-sm font-extrabold text-gray-900 tabular-nums">{formatMoney(j.estimated_revenue || 0)}</div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PhotoCard url={j.before_photo_url} label="Before" />
                <PhotoCard url={j.after_photo_url} label="After" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Print-only footer */}
      <div className="mt-10 hidden print:block text-xs text-gray-500">
        Printed from SmartSend. No addresses shown.
      </div>
    </div>
  );
}



