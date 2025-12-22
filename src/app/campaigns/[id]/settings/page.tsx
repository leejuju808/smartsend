import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { TeamPanel } from "@/components/campaign/TeamPanel";
import { TeamAccessPanel } from "@/components/campaign/TeamAccessPanel";
import { CampaignFollowupsForm } from "@/app/(dash)/campaigns/[id]/settings/followups/CampaignFollowupsForm";
import { RepliesPolicyCard } from "@/app/(dash)/campaigns/[id]/settings/RepliesPolicyCard";
import { AutoFollowupToggle } from "@/components/campaign/AutoFollowupToggle";
import { AutoOptimizeToggle } from "@/components/campaigns/AutoOptimizeToggle";
import { SmartStopToggle } from "@/components/campaigns/SmartStopToggle";
import { CampaignSendingWindowOverride } from "@/components/campaigns/CampaignSendingWindowOverride";
import { AISDRToggle } from "@/components/campaigns/AISDRToggle";
import { SpeedToLeadToggle } from "@/components/campaigns/SpeedToLeadToggle";
import { CampaignTeamCard } from "./_components/campaign-team-card";
import { FollowUpSettingsPanel } from "@/components/campaigns/FollowUpSettingsPanel";

export default async function CampaignSettingsPage({ params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          You must be logged in to view this page.
        </p>
      </div>
    );
  }

  // Get campaign with owner_user_id (or fallback to owner_id/user_id)
  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "id, name, owner_user_id, owner_id, user_id, speed_to_lead_enabled, speed_to_lead_delay_seconds, speed_to_lead_intents"
    )
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return <div className="p-6">Campaign not found.</div>;
  }

  // Determine owner_user_id (prefer owner_user_id, fallback to owner_id, then user_id)
  const ownerUserId = campaign.owner_user_id || campaign.owner_id || campaign.user_id || user.id;

  // Load members
  const { data: membersData } = await supabase
    .from("campaign_members")
    .select("user_id, role, created_at")
    .eq("campaign_id", params.id)
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });

  // Load profiles for all member user_ids
  const userIds = membersData?.map((m) => m.user_id) || [];
  const { data: profilesData } = userIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds)
    : { data: null };

  // Combine members with profiles
  const profileMap = new Map(
    profilesData?.map((p) => [p.id, p]) || []
  );
  const members = (membersData || []).map((m) => ({
    ...m,
    profile: profileMap.get(m.user_id) || null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {campaign.name} – Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Control automation, AI behavior, and team access for this campaign.
        </p>
      </div>

      <CampaignTeamCard
        campaignId={campaign.id}
        ownerUserId={ownerUserId}
        currentUserId={user.id}
        members={members ?? []}
      />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Team</h2>
        <TeamPanel campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Team Access</h2>
        <TeamAccessPanel campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Optimization</h2>
        <AutoOptimizeToggle campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Replies</h2>
        <RepliesPolicyCard id={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">SmartStop</h2>
        <SmartStopToggle campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Auto Follow-Ups</h2>
        <AutoFollowupToggle campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Sending Window</h2>
        <CampaignSendingWindowOverride campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">AI SDR</h2>
        <AISDRToggle campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Speed-to-Lead</h2>
        <SpeedToLeadToggle campaignId={params.id} />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Follow-Up Automation</h2>
        <FollowUpSettingsPanel campaignId={params.id} />
      </div>
      <CampaignFollowupsForm campaignId={params.id} />
    </div>
  );
}


