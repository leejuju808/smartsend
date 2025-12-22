// app/[workspaceSlug]/dashboard/page.tsx
import { createClient } from "@/lib/supabase/server";
import { WorkspaceDashboardStatsCards } from "@/components/dashboard/workspace-stats-cards";
import { TopCampaignsTable } from "@/components/dashboard/top-campaigns-table";
import { WorkspaceSummaryWithRange } from "@/components/dashboard/workspace-summary-with-range";

type PageProps = {
  params: {
    workspaceSlug: string;
  };
};

export default async function WorkspaceDashboardPage({ params }: PageProps) {
  const supabase = createClient();
  const { workspaceSlug } = params;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", workspaceSlug)
    .single();

  if (!workspace) {
    return null; // or 404
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Load all metrics rows for this workspace
  const { data: rows } = await supabase
    .from("v_campaign_metrics")
    .select(
      "campaign_id, campaign_name, campaign_created_at, total_sent, total_delivered, unique_opens, unique_clicks, unique_replies, total_bounces, open_rate, click_rate, reply_rate"
    )
    .eq("workspace_id", workspace.id);

  const metricsRows = rows ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workspace.name} Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            High-level performance across all campaigns.
          </p>
        </div>
      </header>

      {/* NEW: Time-range summary row */}
      <WorkspaceSummaryWithRange workspaceId={workspace.id} />

      {/* Existing: all-time metrics computed from campaign rows */}
      <WorkspaceDashboardStatsCards rows={metricsRows} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Top campaigns
        </h2>
        <TopCampaignsTable
          workspaceSlug={workspace.slug}
          rows={metricsRows}
        />
      </section>
    </div>
  );
}

