// Unified Search API - Block 9300 (v1) + Block 10800 (v2)
// GET /api/search?q=...&types=contacts,replies,campaigns,tasks,activity
// Search contacts, replies, campaigns, tasks, and activity events

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// Helper function to calculate search score
function calculateScore(matchType: "exact" | "prefix" | "contains", field: "email" | "name" | "title" | "other"): number {
  let baseScore = 0;
  
  // Match type scoring
  if (matchType === "exact") baseScore = 100;
  else if (matchType === "prefix") baseScore = 80;
  else baseScore = 50;
  
  // Field type scoring
  if (field === "email") baseScore += 20;
  else if (field === "name") baseScore += 15;
  else if (field === "title") baseScore += 10;
  
  return baseScore;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const types = url.searchParams.get("types")?.split(",") || ["contacts", "replies", "campaigns", "tasks", "activity"];

  const supabase = createRouteHandlerClient({ cookies });

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace IDs via workspace_members
  const { data: memberships, error: memErr } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  if (memErr || !memberships || memberships.length === 0) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceIds = memberships.map((m) => m.workspace_id);
  
  // Also get org_ids if org_members table exists (for tasks and activity)
  let orgIds: string[] = [];
  try {
    const { data: orgMemberships } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id);
    if (orgMemberships) {
      orgIds = orgMemberships.map((m: any) => m.org_id);
    }
  } catch (e) {
    // org_members table might not exist, use workspace_ids as org_ids
    orgIds = workspaceIds;
  }
  
  // If no org_ids found, use workspace_ids as fallback
  if (orgIds.length === 0) {
    orgIds = workspaceIds;
  }

  const results: {
    contacts: any[];
    replies: any[];
    campaigns: any[];
    tasks: any[];
    activity: any[];
  } = {
    contacts: [],
    replies: [],
    campaigns: [],
    tasks: [],
    activity: [],
  };

  // Search contacts
  if (types.includes("contacts") && q.trim()) {
    const searchTerm = q.trim();
    
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, email, first_name, last_name, company, phone, tags")
      .in("workspace_id", workspaceIds)
      .or(
        `email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
      )
      .limit(5)
      .order("created_at", { ascending: false });

    if (!contactsError && contacts) {
      const searchLower = q.trim().toLowerCase();
      results.contacts = contacts.map((c: any) => {
        const name = c.first_name || c.last_name ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : null;
        const emailLower = c.email?.toLowerCase() || "";
        const nameLower = name?.toLowerCase() || "";
        
        // Calculate score
        let score = 50;
        if (emailLower === searchLower) score = calculateScore("exact", "email");
        else if (emailLower.startsWith(searchLower)) score = calculateScore("prefix", "email");
        else if (nameLower === searchLower) score = calculateScore("exact", "name");
        else if (nameLower.startsWith(searchLower)) score = calculateScore("prefix", "name");
        
        return {
          id: c.id,
          type: "contact" as const,
          contactId: c.id,
          name: name,
          email: c.email,
          status: null,
          city: null,
          state: null,
          company: c.company || null,
          score: score,
        };
      });
    }
  }

  // Search reply threads
  if (types.includes("replies") && q.trim()) {
    const searchTerm = q.trim();
    
    // Use reply_inbox_summary view (similar to inbox/replies route)
    const { data: threads, error: threadsError } = await supabase
      .from("reply_inbox_summary")
      .select("*")
      .in("workspace_id", workspaceIds)
      .or(
        `contact_name.ilike.%${searchTerm}%,contact_email.ilike.%${searchTerm}%,display_email.ilike.%${searchTerm}%,subject.ilike.%${searchTerm}%,campaign_name.ilike.%${searchTerm}%`
      )
      .limit(5)
      .order("last_activity_at", { ascending: false });

    if (!threadsError && threads) {
      // Get latest message snippets for these threads
      const threadIds = threads.map((t: any) => t.id);
      let latestMessages = new Map();
      
      if (threadIds.length > 0) {
        const { data: messages } = await supabase
          .from("reply_messages")
          .select("thread_id, snippet, body")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: false });

        messages?.forEach((msg: any) => {
          if (!latestMessages.has(msg.thread_id)) {
            latestMessages.set(msg.thread_id, msg);
          }
        });
      }

      const searchLower = q.trim().toLowerCase();
      results.replies = threads.map((t: any) => {
        const latestMsg = latestMessages.get(t.id);
        const snippet = latestMsg?.snippet || (latestMsg?.body ? latestMsg.body.substring(0, 120) : null);
        const contactEmail = t.display_email || t.contact_email || null;
        const contactName = t.contact_name || null;
        
        // Calculate score
        let score = 50;
        const emailLower = contactEmail?.toLowerCase() || "";
        const nameLower = contactName?.toLowerCase() || "";
        if (emailLower.includes(searchLower)) score = calculateScore("contains", "email");
        if (nameLower.includes(searchLower)) score = Math.max(score, calculateScore("contains", "name"));
        
        return {
          id: t.id,
          type: "reply" as const,
          threadId: t.id,
          contactId: t.contact_id || "",
          contactName: contactName,
          contactEmail: contactEmail || "",
          latestIntent: t.latest_intent || "unclassified",
          snippet: snippet || "",
          campaignName: t.campaign_name || null,
          lastActivityAt: t.last_activity_at,
          score: score,
        };
      });
    }
  }

  // Search campaigns
  if (types.includes("campaigns") && q.trim()) {
    const searchTerm = `%${q.trim().toLowerCase()}%`;
    
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id, name, status, workspace_id")
      .in("workspace_id", workspaceIds)
      .or(`name.ilike.${searchTerm}`)
      .limit(5)
      .order("created_at", { ascending: false });

    if (!campaignsError && campaigns) {
      const searchLower = q.trim().toLowerCase();
      results.campaigns = campaigns.map((c: any) => {
        const nameLower = c.name?.toLowerCase() || "";
        let score = 50;
        if (nameLower === searchLower) score = calculateScore("exact", "name");
        else if (nameLower.startsWith(searchLower)) score = calculateScore("prefix", "name");
        
        return {
          id: c.id,
          type: "campaign" as const,
          campaignId: c.id,
          name: c.name,
          status: c.status || "draft",
          score: score,
        };
      });
    }
  }

  // Search tasks
  if (types.includes("tasks") && q.trim()) {
    const searchTerm = q.trim();
    const searchLower = searchTerm.toLowerCase();
    
    // Check if query contains time-related keywords
    const timeKeywords = ["due", "today", "overdue", "tomorrow"];
    const hasTimeKeyword = timeKeywords.some(kw => searchLower.includes(kw));
    
    let tasksQuery = supabase
      .from("tasks")
      .select(`
        id,
        title,
        due_at,
        completed,
        contact_id,
        org_id
      `)
      .in("org_id", orgIds)
      .or(`title.ilike.%${searchTerm}%`)
      .limit(5);
    
    // If time keyword present, prioritize by due date
    if (hasTimeKeyword) {
      tasksQuery = tasksQuery.order("due_at", { ascending: true, nullsLast: true });
    } else {
      tasksQuery = tasksQuery.order("due_at", { ascending: true, nullsLast: true });
    }
    
    const { data: tasks, error: tasksError } = await tasksQuery;
    
    if (!tasksError && tasks) {
      // Get contact names for tasks
      const contactIds = tasks.filter((t: any) => t.contact_id).map((t: any) => t.contact_id);
      let contactMap = new Map();
      
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, first_name, last_name, email")
          .in("id", contactIds);
        
        contacts?.forEach((c: any) => {
          const name = c.first_name || c.last_name ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : null;
          contactMap.set(c.id, { name, email: c.email });
        });
      }
      
      results.tasks = tasks.map((t: any) => {
        const titleLower = t.title?.toLowerCase() || "";
        let score = 50;
        if (titleLower === searchLower) score = calculateScore("exact", "title");
        else if (titleLower.startsWith(searchLower)) score = calculateScore("prefix", "title");
        
        // Boost score if due today or overdue
        if (t.due_at) {
          const dueDate = new Date(t.due_at);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (dueDate < today && !t.completed) score += 30; // Overdue
          else if (dueDate.toDateString() === today.toDateString()) score += 20; // Due today
        }
        
        const contactInfo = contactMap.get(t.contact_id);
        
        return {
          id: t.id,
          type: "task" as const,
          taskId: t.id,
          title: t.title,
          dueAt: t.due_at,
          completed: t.completed || false,
          contactId: t.contact_id || undefined,
          contactName: contactInfo?.name || undefined,
          score: score,
        };
      });
    }
  }

  // Search activity events (recent 30 days)
  if (types.includes("activity") && q.trim()) {
    const searchTerm = q.trim();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: activities, error: activitiesError } = await supabase
      .from("activity_events")
      .select(`
        id,
        type,
        title,
        description,
        contact_id,
        reply_thread_id,
        campaign_id,
        created_at
      `)
      .in("org_id", orgIds)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order("created_at", { ascending: false })
      .limit(5);
    
    if (!activitiesError && activities) {
      const searchLower = q.trim().toLowerCase();
      results.activity = activities.map((a: any) => {
        const titleLower = a.title?.toLowerCase() || "";
        let score = 50;
        if (titleLower.includes(searchLower)) score = calculateScore("contains", "title");
        
        return {
          id: a.id,
          type: "activity" as const,
          activityId: a.id,
          activityType: a.type,
          title: a.title,
          description: a.description || undefined,
          relatedContactId: a.contact_id || undefined,
          relatedThreadId: a.reply_thread_id || undefined,
          relatedCampaignId: a.campaign_id || undefined,
          createdAt: a.created_at,
          score: score,
        };
      });
    }
  }

  return NextResponse.json(results);
}

