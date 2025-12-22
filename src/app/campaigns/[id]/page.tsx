// Example integration in your Campaign page
// File: /app/campaigns/[id]/page.tsx (or wherever you view a single campaign)

import DeliveryTiles from "./components/DeliveryTiles";
import CampaignPageClient from "./CampaignPageClient";
import { SendHealthCard } from "./send/SendHealthCard";
import { getCampaignStats } from "@/lib/db/campaignStats";
import { RoleBadge } from "@/components/role-badge";
import { ShareCampaignModal } from "@/components/campaign/ShareCampaignModal";
import { CampaignReplyStatsStrip } from "@/components/campaigns/campaign-reply-stats";
import { CampaignTargetPreview } from "@/components/campaigns/campaign-target-preview";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

type Member = {
  user_id: string;
  role: "owner" | "editor" | "viewer";
};

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const { totals, daily } = await getCampaignStats(params.id);
  const supabase = createServerComponentClient({ cookies });
  const { data: membersData } = await supabase
    .from("campaign_members")
    .select("user_id, role")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });
  const members: Member[] = (membersData ?? []).filter((member): member is Member =>
    Boolean(
      member.user_id &&
      member.role &&
      member.user_id !== "00000000-0000-0000-0000-000000000000"
    )
  );

  // Load campaign data for preview
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, account_id, segment_id")
    .eq("id", params.id)
    .single();
  
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaign Overview</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {members.map((member: any) => (
              <RoleBadge key={member.user_id} role={member.role} />
            ))}
          </div>
          <ShareCampaignModal campaignId={params.id} />
        </div>
      </div>
      {campaign && (
        <CampaignTargetPreview
          accountId={campaign.account_id}
          campaignId={campaign.id}
          segmentId={campaign.segment_id}
        />
      )}
      <CampaignReplyStatsStrip campaignId={params.id} />
      <SendHealthCard campaignId={params.id} />
      <DeliveryTiles totals={totals} daily={daily} />
      <CampaignPageClient campaignId={params.id} />
    </main>
  );
}