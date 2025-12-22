import { CampaignBuilderV2Client } from "./CampaignBuilderV2Client";
import { createServerClient } from "@/lib/supabase/service";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function CampaignEditPage({ params }: { params: { id: string } }) {
  // Check permissions
  const role = await getCampaignRole(params.id);
  if (!can(role, "canEditCampaign")) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-900 mb-2">Access Denied</h2>
          <p className="text-red-700">
            You don't have permission to edit this campaign. Sender or admin access required.
          </p>
        </div>
      </div>
    );
  }

  const supabase = createServerClient();
  const ws = await getActiveWorkspaceId();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, list_id, from_email, send_window_start, send_window_end, daily_cap, throttle_per_minute, warmup_mode")
    .eq("id", params.id)
    .eq("workspace_id", ws)
    .maybeSingle();

  if (!campaign) {
    return <div className="p-6">Campaign not found.</div>;
  }

  return (
    <CampaignBuilderV2Client
      campaignId={params.id}
      initialCampaign={{
        id: campaign.id,
        name: campaign.name || undefined,
        list_id: campaign.list_id || null,
        from_email: campaign.from_email || undefined,
        daily_cap: campaign.daily_cap || undefined,
        send_window_start: campaign.send_window_start || undefined,
        send_window_end: campaign.send_window_end || undefined,
        warmup_mode: campaign.warmup_mode || undefined,
      }}
    />
  );
}
