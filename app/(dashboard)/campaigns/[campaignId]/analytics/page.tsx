import { createClient } from "@/utils/supabase/server";
import { CampaignAnalytics } from "./_components/campaign-analytics";

export const dynamic = "force-dynamic";

export default async function CampaignAnalyticsPage({
  params,
}: {
  params: { campaignId: string };
}) {
  const supabase = createClient();

  // 1. Campaign info
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("id", params.campaignId)
    .single();

  if (!campaign) {
    return <div className="p-6">Campaign not found.</div>;
  }

  // 2. Stats view
  const { data: stat } = await supabase
    .from("campaign_reply_stats")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .single();

  // Fallback if no sends yet
  const analytics = stat ?? {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    total_sends: 0,
    total_leads_sent: 0,
    total_replies: 0,
    total_leads_replied: 0,
    reply_rate_leads_pct: 0,
    intent_positive_count: 0,
    intent_neutral_count: 0,
    intent_negative_count: 0,
    intent_unsubscribe_count: 0,
    intent_bounce_count: 0,
    intent_spam_count: 0,
    intent_referral_count: 0,
    intent_out_of_office_count: 0,
    intent_wrong_person_count: 0,
    intent_not_sure_count: 0,
    first_send_at: null,
    last_send_at: null,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {campaign.name} – Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Reply rates and intent breakdown for this campaign.
        </p>
      </div>

      <CampaignAnalytics analytics={analytics} />
    </div>
  );
}































































