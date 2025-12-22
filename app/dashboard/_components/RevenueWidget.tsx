// app/dashboard/_components/RevenueWidget.tsx

import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type PipelineRow = {
  status: "new" | "in_progress" | "won" | "lost";
  lead_count: number;
  total_value: string; // numeric comes back as string
};

async function getPipelineSummary(): Promise<PipelineRow[]> {
  const supabase = createClient();
  const workspaceId = await getActiveWorkspaceId();

  if (!workspaceId) {
    return [];
  }

  const { data, error } = await supabase
    .from("lead_pipeline_summary_view")
    .select("status, lead_count, total_value")
    .eq("workspace_id", workspaceId);

  if (error || !data) {
    console.error("Error loading lead pipeline summary:", error);
    return [];
  }

  return data as PipelineRow[];
}

function parseValue(value: string | null | undefined): number {
  if (!value) return 0;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default async function RevenueWidget() {
  const summary = await getPipelineSummary();

  const byStatus: Record<string, PipelineRow> = {};
  for (const row of summary) {
    byStatus[row.status] = row;
  }

  const totalPipeline =
    parseValue(byStatus.new?.total_value) +
    parseValue(byStatus.in_progress?.total_value) +
    parseValue(byStatus.won?.total_value);

  const totalWon = parseValue(byStatus.won?.total_value);
  const totalLeads = summary.reduce((acc, row) => acc + row.lead_count, 0);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium tracking-tight">
            Revenue Snapshot
          </h2>
          <p className="text-xs text-muted-foreground">
            Estimated job value from your SmartSend leads.
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-semibold tabular-nums">
            {formatCurrency(totalPipeline)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Pipeline value
          </span>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">New</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {formatCurrency(parseValue(byStatus.new?.total_value))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {byStatus.new?.lead_count ?? 0} leads
          </p>
        </div>

        <div className="rounded-xl border bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">In progress</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {formatCurrency(parseValue(byStatus.in_progress?.total_value))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {byStatus.in_progress?.lead_count ?? 0} leads
          </p>
        </div>

        <div className="rounded-xl border bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Won</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-600">
            {formatCurrency(totalWon)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {byStatus.won?.lead_count ?? 0} jobs
          </p>
        </div>
      </div>

      <footer className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Total leads: {totalLeads}</span>
        <a
          href="/dashboard/leads"
          className="font-medium underline-offset-2 hover:underline"
        >
          View all leads →
        </a>
      </footer>
    </section>
  );
}


























































