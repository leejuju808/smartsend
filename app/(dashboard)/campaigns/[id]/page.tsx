import { createClient } from "@/utils/supabase/server";
import { CampaignLaunchButton } from "@/components/campaigns/campaign-launch-button";
import { CampaignReplyStatsStrip } from "@/components/campaigns/campaign-reply-stats";
import { CampaignTargetPreview } from "@/components/campaigns/campaign-target-preview";
import { CampaignPreflightCard } from "@/components/campaigns/CampaignPreflightCard";
import { CampaignForm } from "./_components/campaign-form";
import { CampaignSharingPanel } from "@/components/campaigns/CampaignSharingPanel";
import { CampaignSharingSection } from "@/components/campaigns/CampaignSharingSection";
import { PlaybookBadge } from "@/components/campaigns/PlaybookBadge";
import { SaveAsPlaybookButton } from "@/components/campaigns/SaveAsPlaybookButton";
import { SharePanel } from "@/components/team/SharePanel";
import { CampaignQuotaBanner } from "@/components/campaigns/CampaignQuotaBanner";
import { getOutboundAccountsForCurrentUser } from "@/lib/smartsend/outbound-accounts";
import { ReplyInbox } from "@/components/campaigns/reply-inbox";
import { CampaignShareToggle } from "@/components/campaigns/campaign-share-toggle";
import { CampaignPerformancePanel } from "@/components/campaigns/CampaignPerformancePanel";
import { FollowUpStatsSection } from "@/components/campaign/FollowUpStatsSection";
import { ABTestDashboard } from "@/components/campaigns/ABTestDashboard";
import { DuplicateCampaignButton } from "@/components/campaigns/DuplicateCampaignButton";
import { CampaignZipPresenceTable } from "@/components/campaigns/CampaignZipPresenceTable";

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const campaignId = params.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, name, subject_template, is_shared, created_by, *")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) return null;

  const accountId = campaign.account_id as string;

  // Block 9900: Load sending accounts for user
  const { data: sendingAccounts } = await supabase
    .from("smartsend_sending_accounts")
    .select("id, provider, from_email, from_name, status")
    .eq("user_id", user.id)
    .eq("status", "connected")
    .order("created_at", { ascending: true });

  // Block 8170: Load outbound email accounts for sender selection
  const outboundAccounts = await getOutboundAccountsForCurrentUser();

  // Get user's role in workspace
  let userRole: string | null = null;
  if (campaign.workspace_id) {
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("role")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!teamMember) {
      const { data: wsMember } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", campaign.workspace_id)
        .eq("user_id", user.id)
        .single();
      userRole = wsMember?.role || null;
    } else {
      userRole = teamMember.role;
    }
  }

  const isAdmin =
    userRole === "owner" ||
    userRole === "admin";

  const isOwner = campaign.created_by === user.id;

  return (
    <div className="space-y-4">
      {/* Quota Banner */}
      <CampaignQuotaBanner
        status={campaign.status}
        statusReason={campaign.status_reason}
      />

      {/* Header row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-semibold">{campaign.name}</h1>
          <p className="text-xs text-muted-foreground">
            {campaign.subject_template || "No subject yet"}
          </p>
          {campaign.playbook_id && (
            <div className="mt-2">
              <PlaybookBadge campaignId={campaignId} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <DuplicateCampaignButton campaignId={campaignId} />
          <CampaignShareToggle
            campaignId={campaign.id}
            isSharedInitial={campaign.is_shared ?? false}
            isOwner={isOwner}
          />
          {campaign.workspace_id && (
            <CampaignSharingPanel
              campaignId={campaignId}
              workspaceId={campaign.workspace_id}
              currentUserId={user.id}
              currentUserRole={userRole}
              initialOwnerId={campaign.owner_id}
              initialVisibility={(campaign.visibility as "workspace" | "restricted") || "workspace"}
            />
          )}
          <SaveAsPlaybookButton
            campaignId={campaignId}
            campaignName={campaign.name || ""}
            isAdmin={isAdmin}
          />
          <CampaignLaunchButton
            campaignId={campaignId}
            segmentId={campaign.segment_id}
          />
        </div>
      </div>

      {/* Stats + target preview */}
      <CampaignReplyStatsStrip campaignId={campaignId} />
      <CampaignTargetPreview
        accountId={accountId}
        campaignId={campaignId}
        segmentId={campaign.segment_id}
      />
      
      {/* A/B Testing Engine - Block 79000 */}
      <ABTestDashboard campaignId={campaignId} />
      
      {/* Performance Panel - Block 16900 */}
      <CampaignPerformancePanel campaignId={campaignId} />

      {/* Block 270700: Zip-Code Heat Presence + Rotation Control */}
      <CampaignZipPresenceTable campaignId={campaignId} />
      
      {/* Follow-Up Stats - Block 21712 & 21713 */}
      <FollowUpStatsSection campaignId={campaignId} />
      
      {/* Preflight Check */}
      <CampaignPreflightCard campaignId={campaignId} />

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* left: steps / stats */}
        <div className="md:col-span-2 space-y-4">
          {/* Share Panel */}
          {campaign.workspace_id && (
            <SharePanel type="campaign" id={campaignId} workspaceId={campaign.workspace_id} />
          )}

          {/* Editor */}
          <CampaignForm
            defaultValues={{
              id: campaign.id,
              account_id: campaign.account_id,
              name: campaign.name,
              from_name: campaign.from_name,
              from_email: campaign.from_email,
              subject: campaign.subject,
              body_html: campaign.body_html,
              segment_id: campaign.segment_id,
              list_id: (campaign as any).list_id ?? null, // Block 10800
              sending_account_id: campaign.sending_account_id ?? null,
              provider: campaign.provider ?? null,
              provider_account_id: campaign.provider_account_id ?? null,
            } as any}
            accountId={accountId}
            smartlistId={campaign.smartlist_id ?? null}
            autoRefresh={campaign.auto_refresh ?? true}
            sendingAccounts={sendingAccounts ?? []}
            outboundAccounts={outboundAccounts}
          />
        </div>

        {/* right: sharing + metadata */}
        <div className="space-y-4">
          <CampaignSharingSection campaignId={campaignId} />
          {/* Reply Inbox */}
          {campaign.workspace_id && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Reply Inbox
              </h2>
              <ReplyInbox
                workspaceId={campaign.workspace_id}
                campaignId={campaign.id}
              />
            </div>
          )}
          {/* other side cards like campaign settings, usage, etc */}
        </div>
      </div>
    </div>
  );
}

