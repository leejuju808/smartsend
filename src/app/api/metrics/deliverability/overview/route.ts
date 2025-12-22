import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<any>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    const workspaceId = profile?.workspace_id;
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaign_id");

    // 1. Mailbox usage today
    const { data: mailboxUsage, error: mailboxError } = await supabase
      .from("mailbox_daily_usage")
      .select(`
        sent_count,
        mailboxes!inner(
          id,
          name,
          from_email,
          daily_cap,
          is_active
        )
      `)
      .eq("date", today)
      .eq("mailboxes.user_id", user.id);

    if (mailboxError) {
      console.error("Error fetching mailbox usage:", mailboxError);
    }

    // 2. Top recipient domains today
    const { data: topDomainsToday, error: domainsTodayError } = await supabase
      .from("domain_daily_usage")
      .select(`
        domain,
        sent_count
      `)
      .eq("date", today)
      .eq("user_id", user.id)
      .order("sent_count", { ascending: false })
      .limit(10);

    if (domainsTodayError) {
      console.error("Error fetching domains today:", domainsTodayError);
    }

    // 3. Top recipient domains last 7 days
    const { data: topDomainsWeek, error: domainsWeekError } = await supabase
      .from("domain_daily_usage")
      .select(`
        domain,
        sent_count
      `)
      .gte("date", sevenDaysAgo)
      .lte("date", today)
      .eq("user_id", user.id)
      .order("sent_count", { ascending: false })
      .limit(10);

    if (domainsWeekError) {
      console.error("Error fetching domains week:", domainsWeekError);
    }

    // 4. Per-step engagement metrics
    let engagementMetrics: any = {};
    
    if (campaignId) {
      // Get engagement for specific campaign
      const { data: campaignEngagement, error: campaignError } = await supabase
        .from("tracking_events")
        .select(`
          type,
          campaigns!inner(
            id,
            name
          )
        `)
        .eq("campaigns.id", campaignId)
        .gte("created_at", sevenDaysAgo);

      if (!campaignError && campaignEngagement) {
        engagementMetrics = {
          opens: campaignEngagement.filter(e => e.type === 'open').length,
          clicks: campaignEngagement.filter(e => e.type === 'click').length,
          total_recipients: 0, // Would need to query campaign_recipients
          open_rate: 0,
          click_rate: 0
        };
      }
    } else {
      // Get engagement for all campaigns
      const { data: allEngagement, error: allEngagementError } = await supabase
        .from("tracking_events")
        .select(`
          type,
          campaigns!inner(
            id,
            user_id
          )
        `)
        .eq("campaigns.user_id", user.id)
        .gte("created_at", sevenDaysAgo);

      if (!allEngagementError && allEngagement) {
        engagementMetrics = {
          opens: allEngagement.filter(e => e.type === 'open').length,
          clicks: allEngagement.filter(e => e.type === 'click').length,
          total_recipients: 0, // Would need to query campaign_recipients
          open_rate: 0,
          click_rate: 0
        };
      }
    }

    // 5. Workspace data if applicable
    let workspaceMailboxUsage: any = null;
    if (workspaceId) {
      const { data: wsMailboxUsage, error: wsError } = await supabase
        .from("mailbox_daily_usage")
        .select(`
          sent_count,
          mailboxes!inner(
            id,
            name,
            from_email,
            daily_cap,
            is_active
          )
        `)
        .eq("date", today)
        .eq("mailboxes.workspace_id", workspaceId);

      if (!wsError && wsMailboxUsage) {
        workspaceMailboxUsage = wsMailboxUsage.map((m: any) => ({
          ...m,
          used_today: m.sent_count,
          remaining_today: Math.max(0, m.mailboxes.daily_cap - m.sent_count)
        }));
      }
    }

    return NextResponse.json({
      mailboxes: {
        personal: mailboxUsage?.map((m: any) => ({
          ...m.mailboxes,
          used_today: m.sent_count,
          remaining_today: Math.max(0, m.mailboxes.daily_cap - m.sent_count)
        })) || [],
        workspace: workspaceMailboxUsage || []
      },
      domains: {
        today: topDomainsToday || [],
        last_7_days: topDomainsWeek || []
      },
      engagement: engagementMetrics,
      summary: {
        total_mailboxes: (mailboxUsage?.length || 0) + (workspaceMailboxUsage?.length || 0),
        total_sent_today: (mailboxUsage?.reduce((sum: number, m: any) => sum + m.sent_count, 0) || 0) + 
                         (workspaceMailboxUsage?.reduce((sum: number, m: any) => sum + m.used_today, 0) || 0),
        top_domain_today: topDomainsToday?.[0]?.domain || null,
        top_domain_week: topDomainsWeek?.[0]?.domain || null
      }
    });

  } catch (error) {
    console.error("Error in deliverability overview:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 