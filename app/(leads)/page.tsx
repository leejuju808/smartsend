import { createClient } from "@/utils/supabase/server";
import { SavedViewsClient } from "./components/SavedViewsClient";
import { IcpFitList } from "./views/IcpFitList";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LeadsSavedViewsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createClient();

  const { data: views, error } = await supabase
    .from("saved_views")
    .select("id, name, description, filters, visibility, scope, campaign_id")
    .order("visibility", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load saved views:", error);
  }

  const { data: campaignsData, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, name")
    .order("created_at", { ascending: false });

  if (campaignsError) {
    console.error("Failed to load campaigns:", campaignsError);
  }

  const { data: icpView } = await supabase
    .from("saved_views")
    .select("id")
    .eq("account_id", "00000000-0000-0000-0000-000000000001")
    .eq("scope", "leads")
    .eq("name", "ICP Fit — SaaS + HubSpot + >50")
    .maybeSingle();

  const serializedViews =
    views?.map((view) => ({
      id: view.id,
      name: view.name,
      description: view.description,
      filters: view.filters,
      visibility: view.visibility ?? undefined,
      scope: view.scope ?? undefined,
      campaignId: view.campaign_id ?? undefined,
    })) ?? [];

  const campaigns =
    campaignsData?.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
    })) ?? [];

  const rawView = searchParams?.view;
  const initialViewId = Array.isArray(rawView) ? rawView[0] : rawView;

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Saved Views</h1>
        <p className="text-sm text-muted-foreground">
          Build reusable filters to zero in on the leads that matter.
        </p>
      </div>
      {icpView?.id && (
        <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              ICP Fit — SaaS + HubSpot + &gt;50
            </h2>
            <p className="text-xs text-muted-foreground">
              Auto-refreshing saved view that spotlights enrichment-qualified leads.
            </p>
          </div>
          <IcpFitList viewId={icpView.id} />
        </section>
      )}
      <SavedViewsClient
        initialViews={serializedViews}
        initialViewId={initialViewId || undefined}
        campaigns={campaigns}
      />
    </main>
  );
}


