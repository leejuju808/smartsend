import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CampaignDetailClient } from "@/components/campaigns/detail-client";
import { getCampaignLaunchReadiness } from "@/lib/smartsend/getCampaignLaunchReadiness";
import { getCampaignWithAccess } from "@/lib/smartsend/getCampaignWithAccess";
import { CampaignSharePanel } from "./_components/campaign-share-panel";
import { CampaignQueueCard } from "@/components/campaigns/campaign-queue-card";
import { CampaignRevenueTable } from "@/components/campaigns/CampaignRevenueTable";
import { HomeDataPersonalizationPreview } from "@/components/campaigns/HomeDataPersonalizationPreview";
import Link from "next/link";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const campaignId = params.id;

  // Check campaign access using the access helper
  const { user, campaign, role } = await getCampaignWithAccess(campaignId);

  if (!user) {
    redirect("/login");
  }

  if (!campaign || role === "none") {
    notFound();
  }

  // Load campaign members with emails (for all members to see the list)
  const { data: members } = await supabase
    .from("campaign_members")
    .select(
      `
      id,
      role,
      user_id,
      created_at,
      profile:profiles (
        email,
        full_name
      )
    `
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  const memberRows =
    members?.map((m: any) => ({
      id: m.id as string,
      role: m.role as "owner" | "editor" | "viewer",
      user_id: m.user_id as string,
      email: m.profile?.email ?? "",
      name: m.profile?.full_name ?? null,
      created_at: m.created_at as string,
    })) ?? [];

  // Load shares (for owner only; others just see read-only info) - keeping for backward compatibility
  let shares: any[] = [];
  if (role === "owner") {
    const { data: sharesData } = await supabase
      .from("smartsend_campaign_shares")
      .select("id, user_id, role, created_at")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: true });
    
    if (sharesData && sharesData.length > 0) {
      // Fetch user emails from profiles table
      const userIds = sharesData.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      
      const emailMap = new Map((profiles || []).map(p => [p.id, p.email]));
      
      // Combine shares with emails
      shares = sharesData.map(share => ({
        ...share,
        user: { email: emailMap.get(share.user_id) || null }
      }));
    }
  }

  // Get campaign details with email account info
  const { data: campaignDetails } = await supabase
    .from("campaigns")
    .select(
      `
      id,
      name,
      workspace_id,
      objective,
      status,
      audience_type,
      segment_id,
      daily_send_cap,
      sending_window_start,
      sending_window_end,
      start_date,
      timezone,
      sequence,
      created_at,
      over_quota,
      from_email_account_id,
      email_accounts:from_email_account_id (
        id,
        provider,
        email,
        account_email,
        display_name
      )
    `
    )
    .eq("id", campaignId)
    .single();

  const { data: events } = await supabase
    .from("campaign_events")
    .select("id, type, from_status, to_status, message, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  // Fetch launch readiness
  const readiness = await getCampaignLaunchReadiness(campaign.id);

  // Load metrics from the view
  const workspaceId = campaignDetails?.workspace_id || campaign.workspace_id;
  const { data: metrics } = await supabase
    .from("v_campaign_metrics")
    .select(
      "total_sent, total_delivered, unique_opens, unique_clicks, unique_replies, total_bounces, open_rate, click_rate, reply_rate"
    )
    .eq("workspace_id", workspaceId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  // Load campaign performance stats
  async function loadPerformance(campaignId: string) {
    const { data, error } = await supabase
      .from("campaign_performance_view")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      console.error("Error loading performance:", error);
      return null;
    }

    return data;
  }

  // Load daily stats for the trend graph
  async function loadDailyStats(campaignId: string) {
    // Get replies grouped by day for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: replies } = await supabase
      .from("email_replies")
      .select("created_at")
      .eq("campaign_id", campaignId)
      .gte("created_at", thirtyDaysAgo.toISOString());

    // Group by date
    const dailyMap = new Map<string, number>();
    if (replies) {
      replies.forEach((reply: any) => {
        const date = new Date(reply.created_at).toISOString().split("T")[0];
        dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
      });
    }

    // Convert to array format
    const dailyStats = Array.from(dailyMap.entries())
      .map(([day, reply_count]) => ({ day, reply_count }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return dailyStats;
  }

  const performance = await loadPerformance(campaignId);
  const dailyStats = await loadDailyStats(campaignId);

  // Get company info for personalization preview (Block 96000)
  let companyCity: string | undefined;
  let companyState: string | undefined;
  let companyZip: string | undefined;
  
  if (user) {
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("city, state, zip_code")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    
    if (company) {
      companyCity = company.city || undefined;
      companyState = company.state || undefined;
      companyZip = company.zip_code || undefined;
    }
  }

  // You can wire real stats later; these are placeholders.
  const stats = {
    sent: 0,
    opens: 0,
    replies: 0,
    meetings: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header with Share button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {campaignDetails?.name || campaign.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Campaign overview and leads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(role === "owner" || role === "editor") && (
            <Link
              href={`/campaigns/${campaignId}/import`}
              className="rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 transition-colors"
            >
              Import Leads
            </Link>
          )}
          {role === "owner" && (
            <CampaignSharePanel
              campaignId={campaignId}
              members={memberRows}
            />
          )}
        </div>
      </div>
      
      {/* Campaign Queue Controls + Usage Bar */}
      <CampaignQueueCard campaignId={campaignId} />
      
      {/* Home Data Personalization Preview (Block 96000) */}
      {companyCity && companyState && (
        <HomeDataPersonalizationPreview
          campaignId={campaignId}
          city={companyCity}
          state={companyState}
          zip={companyZip}
        />
      )}
      
      {/* Campaign detail client */}
      <CampaignDetailClient
        campaign={(campaignDetails || campaign) as any}
        events={events ?? []}
        stats={stats}
        metrics={metrics ?? null}
        performance={performance}
        dailyStats={dailyStats}
        initialReadiness={readiness}
        accessRole={role}
        initialShares={shares}
      />

      {/* Campaign Revenue Attribution */}
      <CampaignRevenueTable />
    </div>
  );
}





