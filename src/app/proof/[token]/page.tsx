"use client";

import { useEffect, useMemo, useState } from "react";
import { use } from "react";

type PublicProofPayload = {
  as_of: string | null;
  emails_sent: number;
  replies: number;
  jobs_booked: number;
  estimated_value: number;
  jobs_closed?: number;
  revenue_closed?: number;
  error?: string;
};

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n || 0);
  } catch {
    return `$${Math.round(n || 0).toLocaleString()}`;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

export default function PublicProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PublicProofPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/proof/${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as PublicProofPayload;
        if (!cancelled) setData(res.ok ? json : { error: json?.error || "Not found" } as any);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const asOf = useMemo(() => {
    const iso = data?.as_of;
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return null;
    }
  }, [data?.as_of]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-24 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!data || (data as any).error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">SmartSend Proof</h1>
          <p className="mt-2 text-sm text-gray-600">{(data as any)?.error || "Not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">SmartSend Proof</h1>
            <div className="mt-1 text-xs text-gray-500">{asOf ? `As of ${asOf}` : ""}</div>
          </div>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 print:hidden"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Metric label="Emails sent" value={(data.emails_sent || 0).toLocaleString()} />
          <Metric label="Replies" value={(data.replies || 0).toLocaleString()} />
          <Metric label="Jobs booked" value={(data.jobs_booked || 0).toLocaleString()} />
          <Metric label="Estimated value" value={formatMoney(data.estimated_value || 0)} />
          <Metric label="Jobs closed" value={(data.jobs_closed || 0).toLocaleString()} />
          <Metric label="Revenue closed" value={formatMoney(data.revenue_closed || 0)} />
        </div>

        <div className="mt-6 rounded-xl border bg-white p-4">
          <div className="text-sm font-semibold">Proof beats belief</div>
          <div className="mt-1 text-sm text-gray-600">
            This is a read-only proof snapshot. No addresses are shown.
          </div>
        </div>
      </div>
    </div>
  );
}



