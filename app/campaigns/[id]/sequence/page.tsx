import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SequenceBuilderClient } from "./SequenceBuilderClient";

export default async function SequenceBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: campaignId } = await params;
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // Get campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, workspace_id, status")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    redirect("/campaigns");
  }

  // Check workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/campaigns");
  }

  // Get existing steps
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });

  // Get workspace plan for feature gating
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("plan_key")
    .eq("id", campaign.workspace_id)
    .single();

  return (
    <SequenceBuilderClient
      campaignId={campaignId}
      campaignName={campaign.name || "Untitled Campaign"}
      campaignStatus={campaign.status}
      initialSteps={steps || []}
      planKey={workspace?.plan_key || "starter"}
    />
  );
}
















































