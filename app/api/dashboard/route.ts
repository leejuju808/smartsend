import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export interface DashboardResponse {
  kpis: {
    hotLeads: { count: number; deltaSinceYesterday: number };
    newReplies: { count: number; totalOpen: number };
    tasksToday: { count: number; overdue: number };
    emailsSent7d: { count: number; replies: number };
  };
  roofingStatusCounts: {
    NEW: number;
    HOT: number;
    WARM: number;
    FOLLOW_UP: number;
    NOT_INTERESTED: number;
    OUT_OF_SCOPE: number;
  };
  hotLeads: Array<{
    contactId: string;
    name: string | null;
    email: string;
    lastIntent: string;
    lastActivityAt: string;
    campaignName?: string | null;
  }>;
  latestReplies: Array<{
    threadId: string;
    contactId: string | null;
    contactName: string | null;
    contactEmail: string | null;
    latestIntent: string | null;
    snippet: string | null;
    lastActivityAt: string;
    campaignName?: string | null;
  }>;
  tasksToday: Array<{
    id: string;
    title: string;
    dueAt: string;
    overdue: boolean;
    contactId?: string | null;
    contactName?: string | null;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    emailsSent7d: number;
    replies7d: number;
    hotLeads7d: number;
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
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now.setHours(0, 0, 0, 0));

  try {
    // 1. Hot Leads Count
    // Count reply_threads with latest_intent='hot'
    const { count: hotLeadsCount } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("latest_intent", "hot");

    // Count yesterday's hot leads for delta
    const { count: hotLeadsYesterday } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("latest_intent", "hot")
      .lt("last_activity_at", yesterday.toISOString());

    const hotLeadsDelta = (hotLeadsCount || 0) - (hotLeadsYesterday || 0);

    // 2. New Replies (unread threads in last 24h)
    const { count: newRepliesCount } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .gte("last_activity_at", yesterday.toISOString());

    const { count: totalOpenThreads } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "open");

    // 3. Tasks Due Today
    // Try org_id first, fallback to workspace_id if tasks table has it
    let tasksQuery = supabase
      .from("tasks")
      .select("id, title, due_at, contact_id, completed", { count: "exact" })
      .eq("assigned_to", userId)
      .eq("completed", false)
      .gte("due_at", todayStart.toISOString())
      .lt("due_at", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString());
    
    // Try org_id first (tasks table uses org_id which maps to workspace_id)
    const { data: tasksToday, count: tasksTodayCount, error: tasksError } = await tasksQuery.eq("org_id", workspaceId);
    
    // If org_id doesn't work, try workspace_id
    let finalTasks = tasksToday;
    let finalTasksCount = tasksTodayCount;
    if (tasksError || !tasksToday) {
      const { data: tasksWorkspace, count: tasksWorkspaceCount } = await supabase
        .from("tasks")
        .select("id, title, due_at, contact_id, completed", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("assigned_to", userId)
        .eq("completed", false)
        .gte("due_at", todayStart.toISOString())
        .lt("due_at", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString());
      finalTasks = tasksWorkspace;
      finalTasksCount = tasksWorkspaceCount;
    }

    const overdueCount = finalTasks?.filter(
      t => new Date(t.due_at) < now
    ).length || 0;

    // 4. Emails Sent (Last 7 Days)
    // Try multiple tables to find email sends
    let emailsSent7d = 0;
    
    // Try messages table first
    const { count: messagesCount } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("status", "sent")
      .gte("sent_at", sevenDaysAgo.toISOString());
    
    if (messagesCount) {
      emailsSent7d = messagesCount;
    } else {
      // Fallback: count messages created in last 7 days
      const { count: messagesCreatedCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId)
        .gte("created_at", sevenDaysAgo.toISOString());
      emailsSent7d = messagesCreatedCount || 0;
    }

    // Count replies in last 7 days
    const { count: replies7d } = await supabase
      .from("reply_threads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("last_activity_at", sevenDaysAgo.toISOString());

    // 5. Hot Leads List (top 5-10)
    const { data: hotLeadsData } = await supabase
      .from("reply_threads")
      .select(`
        id,
        contact_id,
        latest_intent,
        last_activity_at,
        campaign_id,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        ),
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("latest_intent", "hot")
      .order("last_activity_at", { ascending: false })
      .limit(10);

    const hotLeads = (hotLeadsData || []).map(thread => ({
      contactId: thread.contact_id || "",
      name: thread.contacts
        ? `${thread.contacts.first_name || ""} ${thread.contacts.last_name || ""}`.trim() || null
        : null,
      email: thread.contacts?.email || "",
      lastIntent: thread.latest_intent || "unclassified",
      lastActivityAt: thread.last_activity_at || new Date().toISOString(),
      campaignName: thread.campaigns?.name || null,
    }));

    // 6. Latest Replies (open threads, last 24-48h)
    const { data: latestRepliesData } = await supabase
      .from("reply_threads")
      .select(`
        id,
        contact_id,
        latest_intent,
        last_activity_at,
        campaign_id,
        subject,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        ),
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .gte("last_activity_at", new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString())
      .order("last_activity_at", { ascending: false })
      .limit(10);

    const latestReplies = (latestRepliesData || []).map(thread => ({
      threadId: thread.id,
      contactId: thread.contact_id,
      contactName: thread.contacts
        ? `${thread.contacts.first_name || ""} ${thread.contacts.last_name || ""}`.trim() || null
        : null,
      contactEmail: thread.contacts?.email || null,
      latestIntent: thread.latest_intent || "unclassified",
      snippet: thread.subject || null,
      lastActivityAt: thread.last_activity_at || new Date().toISOString(),
      campaignName: thread.campaigns?.name || null,
    }));

    // 7. Tasks Today with contact info
    let tasksWithContactsQuery = supabase
      .from("tasks")
      .select(`
        id,
        title,
        due_at,
        contact_id,
        completed,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("assigned_to", userId)
      .eq("completed", false)
      .gte("due_at", todayStart.toISOString())
      .lt("due_at", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .order("due_at", { ascending: true })
      .limit(10);
    
    const { data: tasksWithContacts, error: tasksContactsError } = await tasksWithContactsQuery.eq("org_id", workspaceId);
    
    // Fallback to workspace_id if org_id doesn't work
    let finalTasksWithContacts = tasksWithContacts;
    if (tasksContactsError || !tasksWithContacts) {
      const { data: tasksWorkspaceContacts } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          due_at,
          contact_id,
          completed,
          contacts:contact_id (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq("workspace_id", workspaceId)
        .eq("assigned_to", userId)
        .eq("completed", false)
        .gte("due_at", todayStart.toISOString())
        .lt("due_at", new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
        .order("due_at", { ascending: true })
        .limit(10);
      finalTasksWithContacts = tasksWorkspaceContacts;
    }

    const tasksToday = (finalTasksWithContacts || []).map(task => ({
      id: task.id,
      title: task.title,
      dueAt: task.due_at,
      overdue: new Date(task.due_at) < now,
      contactId: task.contact_id || null,
      contactName: task.contacts
        ? `${task.contacts.first_name || ""} ${task.contacts.last_name || ""}`.trim() || null
        : null,
    }));

    // 8. Campaign Performance Snapshot
    const { data: campaignsData } = await supabase
      .from("campaigns")
      .select("id, name, status, workspace_id")
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "running", "sending"])
      .limit(10);

    const campaigns = await Promise.all(
      (campaignsData || []).map(async (campaign) => {
        // Count emails sent in last 7 days for this campaign
        let emailsSent = 0;
        const { count: sentCount } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .gte("sent_at", sevenDaysAgo.toISOString());
        
        if (sentCount) {
          emailsSent = sentCount;
        } else {
          const { count: createdCount } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id)
            .gte("created_at", sevenDaysAgo.toISOString());
          emailsSent = createdCount || 0;
        }

        // Count replies in last 7 days for this campaign
        const { count: replies } = await supabase
          .from("reply_threads")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .gte("last_activity_at", sevenDaysAgo.toISOString());

        // Count hot leads from this campaign
        const { count: hotLeads } = await supabase
          .from("reply_threads")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("latest_intent", "hot")
          .gte("last_activity_at", sevenDaysAgo.toISOString());

        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          emailsSent7d: emailsSent || 0,
          replies7d: replies || 0,
          hotLeads7d: hotLeads || 0,
        };
      })
    );

    const response: DashboardResponse = {
      kpis: {
        hotLeads: {
          count: hotLeadsCount || 0,
          deltaSinceYesterday: hotLeadsDelta,
        },
        newReplies: {
          count: newRepliesCount || 0,
          totalOpen: totalOpenThreads || 0,
        },
        tasksToday: {
          count: finalTasksCount || 0,
          overdue: overdueCount,
        },
        emailsSent7d: {
          count: emailsSent7d,
          replies: replies7d || 0,
        },
      },
      roofingStatusCounts: {
        NEW: 0,
        HOT: 0,
        WARM: 0,
        FOLLOW_UP: 0,
        NOT_INTERESTED: 0,
        OUT_OF_SCOPE: 0,
      },
      hotLeads,
      latestReplies,
      tasksToday,
      campaigns,
    };

    // Get roofing status counts
    // Get all leads in workspace
    const { data: workspaceLeads } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId);

    const leadIds = workspaceLeads?.map((l) => l.id) || [];

    if (leadIds.length > 0) {
      const { data: statusCounts } = await supabase
        .from("lead_status")
        .select("status")
        .in("lead_id", leadIds);

      // Count by status
      const counts: Record<string, number> = {
        NEW: 0,
        HOT: 0,
        WARM: 0,
        FOLLOW_UP: 0,
        NOT_INTERESTED: 0,
        OUT_OF_SCOPE: 0,
      };

      statusCounts?.forEach((s) => {
        const status = s.status as keyof typeof counts;
        if (status in counts) {
          counts[status]++;
        }
      });

      // Count NEW as leads without status (default)
      const leadsWithStatus = new Set(statusCounts?.map((s) => s.lead_id) || []);
      counts.NEW = leadIds.length - leadsWithStatus.size;

      response.roofingStatusCounts = counts as any;
    } else {
      // No leads, all counts are 0
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}

