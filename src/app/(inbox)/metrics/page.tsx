import React from "react";

type DailyRepliesRow = {
  day: string;
  replies_total: number;
  ooo_count: number;
  human_count: number;
};

type OooKpiRow = {
  replies_7d: number;
  ooo_7d: number;
  ooo_pct_7d: number | null;
};

type ReviewKpiRow = {
  reviewed_30d: number;
  fp_ooo_30d: number;
  fp_pct_30d: number | null;
};

type BacklogRow = {
  open_count: number;
};

async function loadAll() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!base || !anonKey) {
    throw new Error("Supabase URL or anon key missing");
  }

  const headers = { apikey: anonKey };
  const init: RequestInit = {
    headers,
    next: { revalidate: 300 },
  };

  const [oooRows, dailyRows, reviewRows, backlogRows] = await Promise.all([
    fetch(`${base}/rest/v1/v_kpi_ooo_capture?select=*`, init)
      .then((r) => r.json())
      .then((rows: any[]) => rows?.[0] ?? null),
    fetch(
      `${base}/rest/v1/v_daily_replies?select=*&order=day.asc&limit=30`,
      init,
    ).then((r) => r.json()),
    fetch(`${base}/rest/v1/v_kpi_fp_rate?select=*`, init)
      .then((r) => r.json())
      .then((rows: any[]) => rows?.[0] ?? null),
    fetch(`${base}/rest/v1/v_review_backlog?select=*`, init)
      .then((r) => r.json())
      .then((rows: any[]) => rows?.[0] ?? null),
  ]);

  const coerceNumber = (value: unknown): number =>
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : 0;

  const daily: DailyRepliesRow[] = Array.isArray(dailyRows)
    ? dailyRows.map((row) => ({
        day: row.day,
        replies_total: coerceNumber(row.replies_total),
        ooo_count: coerceNumber(row.ooo_count),
        human_count: coerceNumber(row.human_count),
      }))
    : [];

  const kpi: OooKpiRow | null = oooRows
    ? {
        replies_7d: coerceNumber(oooRows.replies_7d),
        ooo_7d: coerceNumber(oooRows.ooo_7d),
        ooo_pct_7d:
          oooRows.ooo_pct_7d === null || oooRows.ooo_pct_7d === undefined
            ? null
            : Number(oooRows.ooo_pct_7d),
      }
    : null;

  const review: ReviewKpiRow | null = reviewRows
    ? {
        reviewed_30d: coerceNumber(reviewRows.reviewed_30d),
        fp_ooo_30d: coerceNumber(reviewRows.fp_ooo_30d),
        fp_pct_30d:
          reviewRows.fp_pct_30d === null || reviewRows.fp_pct_30d === undefined
            ? null
            : Number(reviewRows.fp_pct_30d),
      }
    : null;

  const backlog: BacklogRow | null = backlogRows
    ? { open_count: coerceNumber(backlogRows.open_count) }
    : null;

  return { kpi, daily, review, backlog };
}

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0%";
  }
  return `${Number(value).toFixed(1)}%`;
};

const formatRatio = (numerator: number | undefined, denominator: number | undefined) =>
  `${numerator ?? 0}/${denominator ?? 0}`;

export default async function MetricsPage() {
  const { kpi, daily, review, backlog } = await loadAll();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reply Classifier — Metrics</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          title="OOO capture (7d)"
          value={formatPercent(kpi?.ooo_pct_7d)}
          sub={formatRatio(kpi?.ooo_7d, kpi?.replies_7d)}
        />
        <KpiCard
          title="False-positives (30d)"
          value={formatPercent(review?.fp_pct_30d)}
          sub={formatRatio(review?.fp_ooo_30d, review?.reviewed_30d)}
        />
        <KpiCard
          title="Review backlog"
          value={String(backlog?.open_count ?? 0)}
        />
      </div>

      <RepliesChart data={daily} />
    </div>
  );
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

type RepliesChartProps = {
  data: DailyRepliesRow[];
};

function RepliesChart({ data }: RepliesChartProps) {
  if (!data?.length) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="text-sm text-muted-foreground mb-2">
          Inbound replies (30d)
        </div>
        <div className="text-sm text-muted-foreground">No data yet.</div>
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

  const width = 900;
  const height = 240;
  const padding = 30;

  const allY = [...total.map((p) => p.y), ...ooo.map((p) => p.y)];
  const maxY = Math.max(1, ...allY);

  const xs = total.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const xRange = Math.max(1, maxX - minX);

  const scaleX = (x: number) =>
    padding + ((x - minX) / xRange) * (width - 2 * padding);
  const scaleY = (y: number) =>
    height - padding - (y / maxY) * (height - 2 * padding);

  const toPoints = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(" ");

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="mb-2 text-sm text-muted-foreground">
        Inbound replies (30d)
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          strokeWidth="2"
          stroke="#2563eb"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={toPoints(total)}
        />
        <polyline
          fill="none"
          strokeWidth="2"
          stroke="#f97316"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={toPoints(ooo)}
        />
        <text x={padding} y={18} fontSize="10" fill="#2563eb">
          total
        </text>
        <text x={padding + 48} y={18} fontSize="10" fill="#f97316">
          ooo
        </text>
      </svg>
    </div>
  );
}


