import { createClient } from "@supabase/supabase-js";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadsMetrics } from "@/components/leads/leads-metrics";

export default async function LeadsPage({ searchParams }: { searchParams: Record<string, string | string[]> }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const pageSize = 25;
  const page = Math.max(1, parseInt(String(searchParams.page ?? "1"), 10));
  const status = searchParams.status ? String(searchParams.status) : "";
  const campaign = searchParams.campaign ? String(searchParams.campaign) : "";
  const from = searchParams.from ? String(searchParams.from) : "";
  const to = searchParams.to ? String(searchParams.to) : "";

  // TODO: replace with your real workspace from session
  const workspaceId = "";
  const campaignId = campaign || null;

  let q = supabase.from("leads").select("*", { count: "exact" }).eq("workspace_id", workspaceId);

  if (status) q = q.eq("status", status);
  if (campaign) q = q.eq("campaign_id", campaign);
  if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
  if (to) q = q.lte("created_at", `${to}T23:59:59.999Z`);

  q = q.order("updated_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const [{ data: leads, count, error }, { data: campaigns }] = await Promise.all([
    q,
    supabase.from("campaigns").select("id,name").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
  ]);

  if (error) {
    return <div className="p-4 text-red-600">Error loading leads: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
      </div>

      {/* Live counters */}
      <LeadsMetrics workspaceId={workspaceId} campaignId={campaignId ?? undefined} from={from} to={to} />

      <LeadsFilters campaigns={(campaigns ?? []) as any} />

      <LeadsTable
        rows={(leads ?? []) as any}
        total={count ?? 0}
        pageSize={pageSize}
        workspaceId={workspaceId}
        campaignId={campaignId}
        maxAttempts={3}
      />
    </div>
  );
}


