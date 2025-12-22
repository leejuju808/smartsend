import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get active workspace
    const activeWorkspace = req.nextUrl.searchParams.get("workspace_id");
    if (!activeWorkspace) {
      return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    }

    // Get date range (default: last 30 days)
    const days = parseInt(req.nextUrl.searchParams.get("days") || "30");
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const toDate = new Date();

    // ============================================
    // 1. Global KPI Cards
    // ============================================
    const { data: globalStats } = await supabaseAdmin.rpc("get_global_sequence_stats", {
      p_workspace_id: activeWorkspace,
      p_from_date: fromDate.toISOString(),
      p_to_date: toDate.toISOString(),
    }).single();

    // Fallback query if RPC doesn't exist
    let totalSent = 0;
    let delivered = 0;
    let opened = 0;
    let replied = 0;
    let clicked = 0;
    let bounced = 0;
    let unsubscribed = 0;
    let spamComplaints = 0;
    let interestedReplies = 0;

    // Get all campaigns in workspace
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("workspace_id", activeWorkspace);

    const campaignIds = campaigns?.map((c) => c.id) || [];

    if (campaignIds.length > 0) {
      // Total sent
      const { count: sentCount } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString())
        .in("status", ["sent", "delivered"]);

      totalSent = sentCount || 0;

      // Delivered
      const { count: deliveredCount } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString())
        .eq("status", "delivered");

      delivered = deliveredCount || 0;

      // Opens
      const { count: opensCount } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("kind", "open")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      opened = opensCount || 0;

      // Clicks
      const { count: clicksCount } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("kind", "click")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      clicked = clicksCount || 0;

      // Replies
      const { data: repliesData } = await supabaseAdmin
        .from("send_logs")
        .select("id, reply_at")
        .in("campaign_id", campaignIds)
        .not("reply_at", "is", null)
        .gte("reply_at", fromDate.toISOString())
        .lte("reply_at", toDate.toISOString());

      replied = repliesData?.length || 0;

      // Interested replies (from reply_threads or reply_classifications)
      const { count: interestedCount } = await supabaseAdmin
        .from("reply_threads")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("intent_primary", "interested")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      interestedReplies = interestedCount || 0;

      // Bounces
      const { count: bouncesCount } = await supabaseAdmin
        .from("delivery_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .in("kind", ["bounce", "rejected", "dropped"])
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      bounced = bouncesCount || 0;

      // Unsubscribes
      const { count: unsubCount } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("kind", "unsubscribe")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      unsubscribed = unsubCount || 0;

      // Spam complaints (from delivery_events or tracking_events)
      const { count: spamCount } = await supabaseAdmin
        .from("delivery_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("kind", "spam")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      spamComplaints = spamCount || 0;
    }

    const globalKPIs = {
      totalSent,
      delivered,
      deliveredRate: totalSent > 0 ? (delivered / totalSent) * 100 : 0,
      openRate: totalSent > 0 ? (opened / totalSent) * 100 : 0,
      replyRate: totalSent > 0 ? (replied / totalSent) * 100 : 0,
      clickRate: totalSent > 0 ? (clicked / totalSent) * 100 : 0,
      bounceRate: totalSent > 0 ? (bounced / totalSent) * 100 : 0,
      unsubscribeRate: totalSent > 0 ? (unsubscribed / totalSent) * 100 : 0,
      spamRate: totalSent > 0 ? (spamComplaints / totalSent) * 100 : 0,
      interestedReplies,
      unsubscribes: unsubscribed,
      spamComplaints,
    };

    // ============================================
    // 2. Performance Over Time (Daily)
    // ============================================
    const dailyData: Array<{
      date: string;
      sent: number;
      opened: number;
      replied: number;
      clicked: number;
      bounced: number;
      spam: number;
      interested: number;
    }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const { count: daySent } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString())
        .in("status", ["sent", "delivered"]);

      const { count: dayOpened } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("kind", "open")
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString());

      const { count: dayReplied } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .not("reply_at", "is", null)
        .gte("reply_at", dayStart.toISOString())
        .lte("reply_at", dayEnd.toISOString());

      const { count: dayClicked } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("kind", "click")
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString());

      const { count: dayBounced } = await supabaseAdmin
        .from("delivery_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .in("kind", ["bounce", "rejected", "dropped"])
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString());

      const { count: daySpam } = await supabaseAdmin
        .from("delivery_events")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("kind", "spam")
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString());

      const { count: dayInterested } = await supabaseAdmin
        .from("reply_threads")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("intent_primary", "interested")
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString());

      dailyData.push({
        date: dayStart.toISOString().split("T")[0],
        sent: daySent || 0,
        opened: dayOpened || 0,
        replied: dayReplied || 0,
        clicked: dayClicked || 0,
        bounced: dayBounced || 0,
        spam: daySpam || 0,
        interested: dayInterested || 0,
      });
    }

    // ============================================
    // 3. Best & Worst Campaigns
    // ============================================
    const { data: campaignMetrics } = await supabaseAdmin
      .from("campaigns")
      .select(`
        id,
        name,
        send_logs!inner(count),
        tracking_events!inner(count)
      `)
      .eq("workspace_id", activeWorkspace)
      .limit(100);

    const campaignPerformance: Array<{
      campaignId: string;
      campaignName: string;
      sent: number;
      openRate: number;
      replyRate: number;
      clickRate: number;
      bounceRate: number;
      interested: number;
    }> = [];

    for (const campaign of campaigns || []) {
      const { count: cSent } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString())
        .in("status", ["sent", "delivered"]);

      const { count: cOpened } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("kind", "open")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      const { count: cReplied } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .not("reply_at", "is", null)
        .gte("reply_at", fromDate.toISOString())
        .lte("reply_at", toDate.toISOString());

      const { count: cClicked } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("kind", "click")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      const { count: cBounced } = await supabaseAdmin
        .from("delivery_events")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("kind", ["bounce", "rejected", "dropped"])
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      const { count: cInterested } = await supabaseAdmin
        .from("reply_threads")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("intent_primary", "interested")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      const sent = cSent || 0;
      const openRate = sent > 0 ? (cOpened || 0) / sent * 100 : 0;
      const replyRate = sent > 0 ? (cReplied || 0) / sent * 100 : 0;
      const clickRate = sent > 0 ? (cClicked || 0) / sent * 100 : 0;
      const bounceRate = sent > 0 ? (cBounced || 0) / sent * 100 : 0;

      campaignPerformance.push({
        campaignId: campaign.id,
        campaignName: campaign.name || "Unnamed Campaign",
        sent,
        openRate,
        replyRate,
        clickRate,
        bounceRate,
        interested: cInterested || 0,
      });
    }

    const bestCampaigns = [...campaignPerformance]
      .filter((c) => c.sent >= 10) // Minimum threshold
      .sort((a, b) => b.replyRate - a.replyRate)
      .slice(0, 10);

    const worstCampaigns = [...campaignPerformance]
      .filter((c) => c.sent >= 10)
      .sort((a, b) => a.replyRate - b.replyRate)
      .slice(0, 10);

    // ============================================
    // 4. Step-Level Funnel
    // ============================================
    const stepFunnel: Array<{
      step: number;
      sent: number;
      percentage: number;
    }> = [];

    // Get max step number
    const { data: maxStepData } = await supabaseAdmin
      .from("send_logs")
      .select("step_no")
      .in("campaign_id", campaignIds)
      .not("step_no", "is", null)
      .order("step_no", { ascending: false })
      .limit(1)
      .single();

    const maxStep = maxStepData?.step_no || 1;

    for (let step = 1; step <= maxStep; step++) {
      const { count: stepSent } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("step_no", step)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString())
        .in("status", ["sent", "delivered"]);

      stepFunnel.push({
        step,
        sent: stepSent || 0,
        percentage: step === 1 ? 100 : totalSent > 0 ? ((stepSent || 0) / totalSent) * 100 : 0,
      });
    }

    // Replies percentage
    stepFunnel.push({
      step: 999, // Special marker for replies
      sent: replied,
      percentage: totalSent > 0 ? (replied / totalSent) * 100 : 0,
    });

    // ============================================
    // 5. Inbox/Domain Performance
    // ============================================
    const inboxPerformance: Array<{
      inboxId: string;
      inboxEmail: string;
      domain: string;
      volume: number;
      openRate: number;
      replyRate: number;
      bounceRate: number;
      spamRate: number;
      healthScore: number;
    }> = [];

    // Get inboxes for workspace (try different table names)
    let inboxes: any[] = [];
    try {
      const { data: inboxData } = await supabaseAdmin
        .from("sender_inboxes")
        .select("id, email, domain_id, domains!inner(domain)")
        .eq("workspace_id", activeWorkspace);
      inboxes = inboxData || [];
    } catch (e) {
      // Try alternative table name
      try {
        const { data: inboxData } = await supabaseAdmin
          .from("inboxes")
          .select("id, email, domain")
          .eq("workspace_id", activeWorkspace);
        inboxes = (inboxData || []).map((i: any) => ({
          id: i.id,
          email: i.email,
          domain: i.domain || "unknown",
          domains: { domain: i.domain || "unknown" },
        }));
      } catch (e2) {
        // No inboxes table available
        console.warn("Could not fetch inboxes:", e2);
      }
    }

    for (const inbox of inboxes) {
      // Try to get stats via account_id or other relationships
      // For now, use a simplified approach - aggregate by domain if possible
      const domain = (inbox.domains as any)?.domain || inbox.domain || "unknown";
      
      // Get account_id from inbox if available
      let accountId: string | null = null;
      try {
        const { data: accountData } = await supabaseAdmin
          .from("connected_accounts")
          .select("id")
          .eq("inbox_id", inbox.id)
          .limit(1)
          .maybeSingle();
        accountId = accountData?.id || null;
      } catch (e) {
        // Account relationship not available
      }

      // Query send_logs by account_id if available, otherwise skip inbox-level stats
      let inboxSent = 0;
      let inboxOpened = 0;
      let inboxReplied = 0;
      let inboxBounced = 0;
      let inboxSpam = 0;

      if (accountId) {
        const { count: sentCount } = await supabaseAdmin
          .from("send_logs")
          .select("*", { count: "exact", head: true })
          .eq("account_id", accountId)
          .gte("created_at", fromDate.toISOString())
          .lte("created_at", toDate.toISOString())
          .in("status", ["sent", "delivered"]);

        inboxSent = sentCount || 0;
      }

      // For now, use placeholder values if account_id relationship doesn't exist
      // In production, you'd want to properly link send_logs to inboxes
      const volume = inboxSent || 0;
      const openRate = volume > 0 ? (inboxOpened || 0) / volume * 100 : 0;
      const replyRate = volume > 0 ? (inboxReplied || 0) / volume * 100 : 0;
      const bounceRate = volume > 0 ? (inboxBounced || 0) / volume * 100 : 0;
      const spamRate = volume > 0 ? (inboxSpam || 0) / volume * 100 : 0;

      // Calculate health score (0-100)
      let healthScore = 100;
      if (bounceRate >= 10) healthScore -= 50;
      else if (bounceRate >= 5) healthScore -= 30;
      else if (bounceRate >= 2) healthScore -= 10;
      if (spamRate >= 0.3) healthScore -= 70;
      else if (spamRate >= 0.1) healthScore -= 30;
      if (openRate < 10) healthScore -= 40;
      else if (openRate < 20) healthScore -= 20;
      if (replyRate < 0.5) healthScore -= 20;
      else if (replyRate < 1) healthScore -= 10;
      healthScore = Math.max(0, Math.min(100, healthScore));

      inboxPerformance.push({
        inboxId: inbox.id,
        inboxEmail: inbox.email,
        domain: domain,
        volume,
        openRate,
        replyRate,
        bounceRate,
        spamRate,
        healthScore,
      });
    }

    // ============================================
    // 6. SDR Leaderboard
    // ============================================
    const sdrLeaderboard: Array<{
      sdrId: string;
      sdrName: string;
      assignedLeads: number;
      replies: number;
      interested: number;
      bookedCalls: number;
    }> = [];

    // Get team members
    let teamMembers: any[] = [];
    try {
      const { data: members } = await supabaseAdmin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", activeWorkspace);
      teamMembers = members || [];
    } catch (e) {
      console.warn("Could not fetch team members:", e);
    }

    for (const member of teamMembers) {
      const userId = member.user_id;

      // Get user profile
      let sdrName = "Unknown";
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email, full_name")
          .eq("id", userId)
          .maybeSingle();
        sdrName = profile?.full_name || profile?.email || "Unknown";
      } catch (e) {
        // Profile not available
      }

      // Assigned leads (leads where owner_id = userId)
      let assignedCount = 0;
      try {
        const { count } = await supabaseAdmin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", userId)
          .in("campaign_id", campaignIds);
        assignedCount = count || 0;
      } catch (e) {
        // owner_id column might not exist
      }

      // Replies (leads assigned to this SDR that received replies)
      let repliesCount = 0;
      try {
        const { data: assignedLeads } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("owner_id", userId)
          .in("campaign_id", campaignIds);
        
        const leadIds = assignedLeads?.map((l) => l.id) || [];
        if (leadIds.length > 0) {
          const { count } = await supabaseAdmin
            .from("send_logs")
            .select("*", { count: "exact", head: true })
            .in("lead_id", leadIds)
            .in("campaign_id", campaignIds)
            .not("reply_at", "is", null)
            .gte("reply_at", fromDate.toISOString())
            .lte("reply_at", toDate.toISOString());
          repliesCount = count || 0;
        }
      } catch (e) {
        // Error calculating replies
      }

      // Interested replies
      let interestedCount = 0;
      try {
        const { data: assignedLeads } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("owner_id", userId)
          .in("campaign_id", campaignIds);
        
        const leadIds = assignedLeads?.map((l) => l.id) || [];
        if (leadIds.length > 0) {
          const { count } = await supabaseAdmin
            .from("reply_threads")
            .select("*", { count: "exact", head: true })
            .in("lead_id", leadIds)
            .in("campaign_id", campaignIds)
            .eq("intent_primary", "interested")
            .gte("created_at", fromDate.toISOString())
            .lte("created_at", toDate.toISOString());
          interestedCount = count || 0;
        }
      } catch (e) {
        // Error calculating interested
      }

      // Booked calls (from meetings table if exists)
      let bookedCallsCount = 0;
      try {
        const { count } = await supabaseAdmin
          .from("meetings")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", userId)
          .gte("created_at", fromDate.toISOString())
          .lte("created_at", toDate.toISOString());
        bookedCallsCount = count || 0;
      } catch (e) {
        // Meetings table might not exist
      }

      sdrLeaderboard.push({
        sdrId: userId,
        sdrName,
        assignedLeads: assignedCount,
        replies: repliesCount,
        interested: interestedCount,
        bookedCalls: bookedCallsCount,
      });
    }

    // ============================================
    // 7. ICP/Segment Performance
    // ============================================
    const icpPerformance: Array<{
      segmentId: string;
      segmentName: string;
      sent: number;
      openRate: number;
      replyRate: number;
      interested: number;
    }> = [];

    // Get segments
    const { data: segments } = await supabaseAdmin
      .from("segments")
      .select("id, name")
      .eq("workspace_id", activeWorkspace);

    for (const segment of segments || []) {
      // Get leads in segment
      const { data: segmentLeads } = await supabaseAdmin
        .from("lead_segment_members")
        .select("lead_id")
        .eq("segment_id", segment.id);

      const leadIds = segmentLeads?.map((l) => l.lead_id) || [];

      if (leadIds.length === 0) continue;

      const { count: segSent } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .in("lead_id", leadIds)
        .in("campaign_id", campaignIds)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString())
        .in("status", ["sent", "delivered"]);

      const { count: segOpened } = await supabaseAdmin
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .in("lead_id", leadIds)
        .in("campaign_id", campaignIds)
        .eq("kind", "open")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      const { count: segReplied } = await supabaseAdmin
        .from("send_logs")
        .select("*", { count: "exact", head: true })
        .in("lead_id", leadIds)
        .in("campaign_id", campaignIds)
        .not("reply_at", "is", null)
        .gte("reply_at", fromDate.toISOString())
        .lte("reply_at", toDate.toISOString());

      const { count: segInterested } = await supabaseAdmin
        .from("reply_threads")
        .select("*", { count: "exact", head: true })
        .in("lead_id", leadIds)
        .in("campaign_id", campaignIds)
        .eq("intent_primary", "interested")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      const sent = segSent || 0;
      const openRate = sent > 0 ? (segOpened || 0) / sent * 100 : 0;
      const replyRate = sent > 0 ? (segReplied || 0) / sent * 100 : 0;

      icpPerformance.push({
        segmentId: segment.id,
        segmentName: segment.name || "Unnamed Segment",
        sent,
        openRate,
        replyRate,
        interested: segInterested || 0,
      });
    }

    return NextResponse.json({
      globalKPIs,
      dailyData,
      bestCampaigns,
      worstCampaigns,
      stepFunnel,
      inboxPerformance,
      sdrLeaderboard: sdrLeaderboard.sort((a, b) => b.replies - a.replies),
      icpPerformance,
    });
  } catch (error: any) {
    console.error("Error fetching sequence analytics:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

