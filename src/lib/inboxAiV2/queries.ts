/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * Inbox Queries with Prioritization
 * 
 * Queries inbox threads sorted by priority (HOT leads first)
 */

import { createClient } from "@supabase/supabase-js";

export interface PrioritizedThread {
  id: string;
  campaign_id: string;
  lead_id: string;
  subject: string | null;
  assigned_to: string | null;
  status: "open" | "snoozed" | "closed";
  last_message_at: string;
  last_direction: "in" | "out" | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  
  // AI v2 fields
  latest_intent_label: string | null;
  latest_intent_confidence: number | null;
  priority_score: number | null;
  
  // Lead info
  lead?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    address: string | null;
    phone: string | null;
  };
  
  // Latest message preview
  latest_message?: {
    body: string;
    sent_at: string;
    direction: "in" | "out";
  };
}

/**
 * Get prioritized inbox threads
 */
export async function getPrioritizedInboxThreads(
  supabase: ReturnType<typeof createClient>,
  options: {
    campaignId?: string;
    status?: "open" | "snoozed" | "closed";
    intentLabel?: string;
    assignedTo?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<PrioritizedThread[]> {
  const {
    campaignId,
    status = "open",
    intentLabel,
    assignedTo,
    limit = 50,
    offset = 0
  } = options;

  let query = supabase
    .from("inbox_threads")
    .select(`
      *,
      leads (
        first_name,
        last_name,
        email,
        address,
        phone
      )
    `)
    .eq("status", status)
    .order("priority_score", { ascending: false, nullsFirst: false })
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  if (intentLabel) {
    query = query.eq("latest_intent_label", intentLabel);
  }

  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }

  const { data: threads, error } = await query;

  if (error) {
    console.error("Error fetching prioritized threads:", error);
    return [];
  }

  // Get latest message for each thread
  const threadIds = threads?.map(t => t.id) || [];
  if (threadIds.length > 0) {
    const { data: messages } = await supabase
      .from("inbox_messages")
      .select("thread_id, body, sent_at, direction")
      .in("thread_id", threadIds)
      .order("sent_at", { ascending: false });

    // Group messages by thread
    const messagesByThread = new Map<string, any>();
    messages?.forEach(msg => {
      if (!messagesByThread.has(msg.thread_id)) {
        messagesByThread.set(msg.thread_id, msg);
      }
    });

    // Add latest message to each thread
    threads?.forEach(thread => {
      const latestMsg = messagesByThread.get(thread.id);
      if (latestMsg) {
        (thread as any).latest_message = {
          body: latestMsg.body.slice(0, 200),
          sent_at: latestMsg.sent_at,
          direction: latestMsg.direction
        };
      }
    });
  }

  return (threads || []) as PrioritizedThread[];
}

/**
 * Get threads grouped by intent label (for inbox prioritization view)
 */
export async function getThreadsByIntent(
  supabase: ReturnType<typeof createClient>,
  campaignId?: string
): Promise<Record<string, PrioritizedThread[]>> {
  const threads = await getPrioritizedInboxThreads(supabase, {
    campaignId,
    status: "open",
    limit: 1000
  });

  // Group by intent label
  const grouped: Record<string, PrioritizedThread[]> = {
    hot_lead: [],
    warm_lead: [],
    quote_request: [],
    inspection_scheduling: [],
    appointment_confirmed: [],
    cold_reply: [],
    not_interested: [],
    other: []
  };

  threads.forEach(thread => {
    const label = thread.latest_intent_label || "other";
    if (grouped[label]) {
      grouped[label].push(thread);
    } else {
      grouped.other.push(thread);
    }
  });

  return grouped;
}

/**
 * Get AI drafts for a thread
 */
export async function getThreadDrafts(
  supabase: ReturnType<typeof createClient>,
  threadId: string
) {
  const { data, error } = await supabase
    .from("inbox_ai_drafts")
    .select("*")
    .eq("thread_id", threadId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching drafts:", error);
    return [];
  }

  return data || [];
}

/**
 * Get booking suggestions for a thread
 */
export async function getBookingSuggestions(
  supabase: ReturnType<typeof createClient>,
  threadId: string
) {
  const { data, error } = await supabase
    .from("inbox_booking_suggestions")
    .select("*")
    .eq("thread_id", threadId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // No suggestions found
    }
    console.error("Error fetching booking suggestions:", error);
    return null;
  }

  return data;
}

/**
 * Get follow-up tasks for a thread
 */
export async function getFollowUpTasks(
  supabase: ReturnType<typeof createClient>,
  threadId: string
) {
  const { data, error } = await supabase
    .from("inbox_followup_tasks")
    .select("*")
    .eq("thread_id", threadId)
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true });

  if (error) {
    console.error("Error fetching follow-up tasks:", error);
    return [];
  }

  return data || [];
}






































