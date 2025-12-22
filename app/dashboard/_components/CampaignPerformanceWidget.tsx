// app/dashboard/_components/CampaignPerformanceWidget.tsx

import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type CampaignRow = {
  campaign_id: string;
  workspace_id: string;
  campaign_name: string;
  campaign_status: string;
  campaign_created_at: string;
  replies_count: number;
  leads_count: number;
  pipeline_value: string; // numeric as text
  won_value: string;      // numeric as text
};

async function getCampaignPerformance(): Promise<CampaignRow[]> {
  const supabase = createClient();
  const workspaceId = await getActiveWorkspaceId();

  if (!workspaceId) {
    return [];
  }

  const { data, error } = await supabase
    .from("campaign_performance_view")
    .select(
      `
      campaign_id,
      workspace_id,
      campaign_name,
      campaign_status,
      campaign_created_at,
      replies_count,
      leads_count,
      pipeline_value,
      won_value
    `
    )
    .eq("workspace_id", workspaceId)
    .order("campaign_created_at", { ascending: false })
    .limit(5);

  if (error || !data) {
    console.error("Error loading campaign performance:", error);
    return [];
  }

  return data as CampaignRow[];
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

export default async function CampaignPerformanceWidget() {
  const campaigns = await getCampaignPerformance();

  const totalPipeline = campaigns.reduce(
    (acc, c) => acc + parseValue(c.pipeline_value),
    0
  );

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium tracking-tight">
            Campaign Performance
          </h2>
          <p className="text-xs text-muted-foreground">
            How each campaign is turning into leads and revenue.
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrency(totalPipeline)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Pipeline (top 5)
          </span>
        </div>
      </header>

      {campaigns.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No campaigns yet. Once you start sending from SmartSend, you'll see
          performance here.
        </p>
      ) : (
        <div className="space-y-2 text-xs">
          {campaigns.map((c) => {
            const pipeline = parseValue(c.pipeline_value);
            const won = parseValue(c.won_value);

            return (
              <article
                key={c.campaign_id}
                className="flex items-start justify-between gap-2 rounded-xl border bg-background px-3 py-2"
              >
                <div className="flex flex-col gap-[2px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium">
                      {c.campaign_name}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-[2px] text-[9px] uppercase tracking-wide text-muted-foreground">
                      {c.campaign_status}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {c.replies_count} replies · {c.leads_count} leads
                  </span>
                </div>

                <div className="flex flex-col items-end gap-[2px]">
                  <span className="text-[11px] font-semibold tabular-nums">
                    {formatCurrency(pipeline)}
                  </span>
                  <span className="text-[10px] text-emerald-600">
                    Won {formatCurrency(won)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="mt-1 flex items-center justify-end text-[11px] text-muted-foreground">
        {/* Hook up later to a dedicated campaigns page if you want */}
        {/* <a href="/dashboard/campaigns" className="font-medium underline-offset-2 hover:underline">
          View all campaigns →
        </a> */}
      </footer>
    </section>
  );
}


























































