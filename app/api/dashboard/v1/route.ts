import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export interface DashboardV1Response {
  repliesToday: {
    count: number;
    deltaVsYesterday: number;
  };
  hotLeads: {
    count: number;
    deltaVsYesterday: number;
  };
  tasksDue: {
    count: number;
    overdue: number;
  };
  estimatedRevenue: {
    total: number;
    deltaThisWeek: number;
  };
  appointments: {
    count: number;
    today: number;
    tomorrow: number;
  };
  campaignActivity: {
    campaignName: string;
    emailsSentToday: number;
    openRate: number;
    replies: number;
  } | null;
  replyTrend: Array<{
    date: string;
    count: number;
  }>;
  revenueTrend: Array<{
    date: string;
    value: number;
  }>;
  hotLeadsTrend: Array<{
    week: string;
    count: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    contactId?: string;
    contactName?: string;
    createdAt: string;
  }>;
  attentionLeads: Array<{
    id: string;
    name: string | null;
    email: string;
    type: "hot" | "warm_question" | "insurance" | "storm" | "availability";
    lastActivityAt: string;
    leadScore: number;
  }>;
}

export async function GET() {
  const supabase = await getServerSupabase();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace found" },
      { status: 404 }
    );
  }

  const userId = user.id;
  const now = new Date();
  const todayStart = new Date(now.setHours(0, 0, 0, 0));
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(todayStart.getTime() + 48 * 60 * 60 * 1000);

  try {
    // 1. Replies Today
    const { count: repliesToday } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("last_activity_at", todayStart.toISOString());

    const { count: repliesYesterday } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("last_activity_at", yesterdayStart.toISOString())
      .lt("last_activity_at", todayStart.toISOString());

    const repliesDelta = (repliesToday || 0) - (repliesYesterday || 0);

    // 2. HOT Leads
    const { count: hotLeadsCount } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("latest_intent", "hot");

    const { count: hotLeadsYesterday } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("latest_intent", "hot")
      .lt("last_activity_at", yesterdayStart.toISOString());

    const hotLeadsDelta = (hotLeadsCount || 0) - (hotLeadsYesterday || 0);

    // 3. Tasks Due Today
    let tasksQuery = supabase
      .from("tasks")
      .select("id, due_at", { count: "exact" })
      .eq("completed", false)
      .gte("due_at", todayStart.toISOString())
      .lt("due_at", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString());

    // Try org_id first, then workspace_id
    const { data: tasksData, count: tasksCount } = await tasksQuery.eq("org_id", workspaceId);
    let finalTasks = tasksData;
    let finalTasksCount = tasksCount;
    
    if (!finalTasks || finalTasksCount === null) {
      const { data: tasksWorkspace, count: tasksWorkspaceCount } = await supabase
        .from("tasks")
        .select("id, due_at", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("completed", false)
        .gte("due_at", todayStart.toISOString())
        .lt("due_at", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString());
      finalTasks = tasksWorkspace;
      finalTasksCount = tasksWorkspaceCount;
    }

    const overdueCount = finalTasks?.filter(
      t => new Date(t.due_at) < now
    ).length || 0;

    // 4. Estimated Revenue
    const { data: revenueContacts } = await supabase
      .from("contacts")
      .select("estimated_value_min, estimated_value_max, updated_at")
      .eq("workspace_id", workspaceId)
      .not("estimated_value_min", "is", null);

    let totalRevenue = 0;
    let revenueThisWeek = 0;
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    revenueContacts?.forEach(contact => {
      const avgValue = ((contact.estimated_value_min || 0) + (contact.estimated_value_max || 0)) / 2;
      totalRevenue += avgValue;
      
      if (contact.updated_at && new Date(contact.updated_at) >= weekStart) {
        revenueThisWeek += avgValue;
      }
    });

    // Get last week's revenue for delta
    const { data: lastWeekContacts } = await supabase
      .from("contacts")
      .select("estimated_value_min, estimated_value_max")
      .eq("workspace_id", workspaceId)
      .not("estimated_value_min", "is", null)
      .lt("updated_at", weekStart.toISOString());

    let lastWeekRevenue = 0;
    lastWeekContacts?.forEach(contact => {
      const avgValue = ((contact.estimated_value_min || 0) + (contact.estimated_value_max || 0)) / 2;
      lastWeekRevenue += avgValue;
    });

    const revenueDelta = totalRevenue - lastWeekRevenue;

    // 5. Upcoming Appointments
    const { data: appointmentsData } = await supabase
      .from("schedule_bookings")
      .select("id, start_time, status")
      .eq("workspace_id", workspaceId)
      .in("status", ["booked", "confirmed"])
      .gte("start_time", todayStart.toISOString())
      .lt("start_time", tomorrowEnd.toISOString())
      .order("start_time", { ascending: true });

    const appointmentsToday = appointmentsData?.filter(
      apt => new Date(apt.start_time).toDateString() === todayStart.toDateString()
    ).length || 0;

    const appointmentsTomorrow = appointmentsData?.filter(
      apt => {
        const aptDate = new Date(apt.start_time);
        const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        return aptDate.toDateString() === tomorrow.toDateString();
      }
    ).length || 0;

    // 6. Campaign Activity (most active campaign today)
    const { data: campaignsToday } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "running", "sending"])
      .limit(1)
      .single();

    let campaignActivity = null;
    if (campaignsToday) {
      // Count emails sent today for this campaign
      const { count: emailsSentToday } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignsToday.id)
        .gte("sent_at", todayStart.toISOString());

      // Get open rate (simplified - count opens vs sent)
      // Try email_events table, fallback to messages table opens if available
      let opensToday = 0;
      const { count: opensCount } = await supabase
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "open")
        .eq("campaign_id", campaignsToday.id)
        .gte("created_at", todayStart.toISOString());
      
      if (opensCount) {
        opensToday = opensCount;
      } else {
        // Fallback: try to get opens from messages table if it has open tracking
        const { count: messagesOpened } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignsToday.id)
          .not("opened_at", "is", null)
          .gte("opened_at", todayStart.toISOString());
        
        if (messagesOpened) {
          opensToday = messagesOpened;
        }
      }

      const openRate = emailsSentToday && emailsSentToday > 0 
        ? Math.round((opensToday || 0) / emailsSentToday * 100) 
        : 0;

      // Count replies today
      const { count: repliesTodayForCampaign } = await supabase
        .from("reply_threads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignsToday.id)
        .gte("last_activity_at", todayStart.toISOString());

      campaignActivity = {
        campaignName: campaignsToday.name,
        emailsSentToday: emailsSentToday || 0,
        openRate,
        replies: repliesTodayForCampaign || 0,
      };
    }

    // 7. Reply Trend (Last 7 Days)
    const replyTrendData: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStart = new Date(date.setHours(0, 0, 0, 0));
      const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);

      const { count } = await supabase
        .from("reply_threads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("last_activity_at", dateStart.toISOString())
        .lt("last_activity_at", dateEnd.toISOString());

      replyTrendData.push({
        date: dateStart.toISOString().split("T")[0],
        count: count || 0,
      });
    }

    // 8. Revenue Trend (Last 30 Days) - simplified aggregation
    const revenueTrendData: Array<{ date: string; value: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStart = new Date(date.setHours(0, 0, 0, 0));
      const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);

      // Get revenue events created on this date
      const { data: revenueEvents } = await supabase
        .from("revenue_events")
        .select("new_value_min, new_value_max")
        .eq("workspace_id", workspaceId)
        .gte("created_at", dateStart.toISOString())
        .lt("created_at", dateEnd.toISOString());

      let dayRevenue = 0;
      if (revenueEvents) {
        revenueEvents.forEach((event: any) => {
          const avgValue = ((event.new_value_min || 0) + (event.new_value_max || 0)) / 2;
          dayRevenue += avgValue;
        });
      }

      revenueTrendData.push({
        date: dateStart.toISOString().split("T")[0],
        value: dayRevenue,
      });
    }

    // 9. Hot Leads Trend (Weekly)
    const hotLeadsTrendData: Array<{ week: string; count: number }> = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(todayStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const { count } = await supabase
        .from("reply_threads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("latest_intent", "hot")
        .gte("last_activity_at", weekStart.toISOString())
        .lt("last_activity_at", weekEnd.toISOString());

      hotLeadsTrendData.push({
        week: `Week ${4 - i}`,
        count: count || 0,
      });
    }

    // 10. Recent Activity (Last 10 actions from timeline_events)
    const { data: recentActivityData } = await supabase
      .from("timeline_events")
      .select(`
        id,
        event_type,
        event_data,
        created_at,
        contact_id,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);

    const recentActivity = (recentActivityData || []).map(event => {
      let description = "";
      const contactName = event.contacts
        ? `${event.contacts.first_name || ""} ${event.contacts.last_name || ""}`.trim() || null
        : null;

      switch (event.event_type) {
        case "reply_received":
          description = contactName 
            ? `${contactName} replied`
            : "Homeowner replied";
          break;
        case "score_changed":
          description = contactName
            ? `Lead went HOT: ${contactName}`
            : "Lead went HOT";
          break;
        case "enrichment_added":
          description = "Insurance signal detected";
          break;
        case "email_sent":
          description = "Follow-up sent";
          break;
        case "pipeline_moved":
          description = "Pipeline movement";
          break;
        case "task_created":
          description = "Task created";
          break;
        case "campaign_step":
          description = "Campaign step executed";
          break;
        default:
          description = `${event.event_type} event`;
      }

      return {
        id: event.id,
        type: event.event_type,
        description,
        contactId: event.contact_id || undefined,
        contactName: contactName || undefined,
        createdAt: event.created_at,
      };
    });

    // 11. Leads Requiring Attention
    // HOT leads
    const { data: hotLeadsData } = await supabase
      .from("reply_threads")
      .select(`
        id,
        contact_id,
        last_activity_at,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name,
          lead_score
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("latest_intent", "hot")
      .order("last_activity_at", { ascending: false })
      .limit(5);

    // Warm leads with questions (intent = warm and has question indicators)
    const { data: warmLeadsData } = await supabase
      .from("reply_threads")
      .select(`
        id,
        contact_id,
        last_activity_at,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name,
          lead_score
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("latest_intent", "warm")
      .order("last_activity_at", { ascending: false })
      .limit(3);

    // Insurance leads (from contacts with insurance tags or revenue_category)
    const { data: insuranceLeadsData } = await supabase
      .from("contacts")
      .select("id, email, first_name, last_name, lead_score, revenue_category, tags")
      .eq("workspace_id", workspaceId)
      .or("revenue_category.eq.insurance,tags.cs.{insurance,insurance_claim}")
      .order("updated_at", { ascending: false })
      .limit(3);

    // Storm damage leads
    const { data: stormLeadsData } = await supabase
      .from("contacts")
      .select("id, email, first_name, last_name, lead_score, revenue_category, tags")
      .eq("workspace_id", workspaceId)
      .or("revenue_category.eq.storm,tags.cs.{storm,storm_damage}")
      .order("updated_at", { ascending: false })
      .limit(3);

    const attentionLeads: Array<{
      id: string;
      name: string | null;
      email: string;
      type: "hot" | "warm_question" | "insurance" | "storm" | "availability";
      lastActivityAt: string;
      leadScore: number;
    }> = [];

    // Add HOT leads
    hotLeadsData?.forEach(thread => {
      if (thread.contacts) {
        attentionLeads.push({
          id: thread.contact_id || thread.id,
          name: `${thread.contacts.first_name || ""} ${thread.contacts.last_name || ""}`.trim() || null,
          email: thread.contacts.email || "",
          type: "hot",
          lastActivityAt: thread.last_activity_at || new Date().toISOString(),
          leadScore: thread.contacts.lead_score || 0,
        });
      }
    });

    // Add warm leads
    warmLeadsData?.forEach(thread => {
      if (thread.contacts) {
        attentionLeads.push({
          id: thread.contact_id || thread.id,
          name: `${thread.contacts.first_name || ""} ${thread.contacts.last_name || ""}`.trim() || null,
          email: thread.contacts.email || "",
          type: "warm_question",
          lastActivityAt: thread.last_activity_at || new Date().toISOString(),
          leadScore: thread.contacts.lead_score || 0,
        });
      }
    });

    // Add insurance leads
    insuranceLeadsData?.forEach(contact => {
      attentionLeads.push({
        id: contact.id,
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || null,
        email: contact.email || "",
        type: "insurance",
        lastActivityAt: contact.updated_at || new Date().toISOString(),
        leadScore: contact.lead_score || 0,
      });
    });

    // Add storm leads
    stormLeadsData?.forEach(contact => {
      attentionLeads.push({
        id: contact.id,
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || null,
        email: contact.email || "",
        type: "storm",
        lastActivityAt: contact.updated_at || new Date().toISOString(),
        leadScore: contact.lead_score || 0,
      });
    });

    // Sort by last activity and limit to top 10
    attentionLeads.sort((a, b) => 
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    const response: DashboardV1Response = {
      repliesToday: {
        count: repliesToday || 0,
        deltaVsYesterday: repliesDelta,
      },
      hotLeads: {
        count: hotLeadsCount || 0,
        deltaVsYesterday: hotLeadsDelta,
      },
      tasksDue: {
        count: finalTasksCount || 0,
        overdue: overdueCount,
      },
      estimatedRevenue: {
        total: Math.round(totalRevenue),
        deltaThisWeek: Math.round(revenueDelta),
      },
      appointments: {
        count: appointmentsData?.length || 0,
        today: appointmentsToday,
        tomorrow: appointmentsTomorrow,
      },
      campaignActivity,
      replyTrend: replyTrendData,
      revenueTrend: revenueTrendData,
      hotLeadsTrend: hotLeadsTrendData,
      recentActivity,
      attentionLeads: attentionLeads.slice(0, 10),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}

