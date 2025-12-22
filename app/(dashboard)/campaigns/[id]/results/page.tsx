import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { CampaignResultsClient } from "./_components/CampaignResultsClient";

export const dynamic = "force-dynamic";

export default async function CampaignResultsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const campaignId = params.id;

  // Get campaign info
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, workspace_id, created_at, started_at, finished_at")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    redirect("/dashboard/campaigns");
  }

  // Verify workspace access
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    redirect("/dashboard/campaigns");
  }

  // Fetch or calculate campaign results
  let results = null;
  const { data: cachedResults } = await supabase
    .from("campaign_results")
    .select("*")
    .eq("campaign_id", campaignId)
    .single();

  if (cachedResults) {
    results = cachedResults;
  } else {
    // Trigger calculation
    await supabase.rpc("calculate_campaign_results", {
      p_campaign_id: campaignId,
    });

    // Fetch calculated results
    const { data: calculatedResults } = await supabase
      .from("campaign_results")
      .select("*")
      .eq("campaign_id", campaignId)
      .single();

    results = calculatedResults;
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <CampaignResultsClient
        campaignId={campaignId}
        campaignName={campaign.name || "Untitled Campaign"}
        initialResults={results}
      />
    </div>
  );
}





















































