import React from "react";

export const revalidate = 0;

type DailyReply = {
  day: string;
  replies_total: number;
  ooo_count: number;
};

type KpiRow = {
  replies_7d: number;
  ooo_7d: number;
  ooo_pct_7d: number | null;
};

type ReviewRow = {
  fp_pct_30d: number | null;
  fp_ooo_30d: number;
  reviewed_30d: number;
};

type BacklogRow = {
  open_count: number;
};

async function loadAll() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! };
  const [kpi, daily, review] = await Promise.all([
    fetch(`${base}/rest/v1/v_kpi_ooo_capture?select=*`, {
      headers,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((r) => r[0] as KpiRow | undefined),
    fetch(`${base}/rest/v1/v_daily_replies?select=*&order=day.asc&limit=30`, {
      headers,
      cache: "no-store",
    }).then((r) => r.json() as Promise<DailyReply[]>),
    fetch(`${base}/rest/v1/v_kpi_fp_rate?select=*`, {
      headers,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((r) => r[0] as ReviewRow | undefined),
  ]);

  return { kpi, daily, review };
}

export default async function MetricsPage() {
  const { kpi, daily, review } = await loadAll();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reply Classifier — Metrics</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="OOO capture (7d)"
          value={`${kpi?.ooo_pct_7d ?? 0}%`}
          sub={`${kpi?.ooo_7d ?? 0}/${kpi?.replies_7d ?? 0}`}
        />
        <KpiCard
          title="False-positives (30d)"
          value={`${review?.fp_pct_30d ?? 0}%`}
          sub={`${review?.fp_ooo_30d ?? 0}/${review?.reviewed_30d ?? 0}`}
        />
        <BacklogCard />
      </div>

      <RepliesChart data={daily ?? []} />
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {sub ? (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

async function BacklogCard() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! };
  const row = (await fetch(`${base}/rest/v1/v_review_backlog?select=*`, {
    headers,
    cache: "no-store",
  })
    .then((r) => r.json())
    .then((r) => r[0])) as BacklogRow | undefined;
  return <KpiCard title="Review backlog" value={String(row?.open_count ?? 0)} />;
}

function RepliesChart({ data }: { data: DailyReply[] }) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">
          Inbound replies (30d)
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          No reply data available yet.
        </div>
      </div>
    );
  }

  const total = data.map((d) => ({
    x: new Date(d.day).getTime(),
    y: d.replies_total,
  }));
  const ooo = data.map((d) => ({
    x: new Date(d.day).getTime(),
    y: d.ooo_count,
  }));

  const w = 900;
  const h = 240;
  const pad = 30;
  const allY = [...total.map((p) => p.y), ...ooo.map((p) => p.y)];
  const maxY = Math.max(1, ...allY);
  const xs = total.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  const scaleX = (x: number) =>
    pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - 2 * pad);
  const scaleY = (y: number) => h - pad - (y / maxY) * (h - 2 * pad);

  const totalPoints = total.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(" ");
  const oooPoints = ooo.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(" ");

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-2 text-sm text-muted-foreground">
        Inbound replies (30d)
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
        <polyline
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          points={totalPoints}
        />
        <polyline
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          points={oooPoints}
        />
        <text x={pad} y={15} fontSize="10">
          total
        </text>
        <text x={pad + 40} y={15} fontSize="10">
          ooo
        </text>
      </svg>
    </div>
  );
}

