// app/api/inbox/route.ts
// Block 10900 — SmartSend Roofing Reply Inbox v1
// Returns reply threads filtered by intent (HOT, WARM, FOLLOW_UP, NOT_INTERESTED, ALL)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get query params for intent filtering
  const { searchParams } = new URL(req.url);
  const intentFilter = searchParams.get("intent") || "all"; // hot, warm, follow_up, not_interested, all
  const combinedFilter = searchParams.get("combined"); // "hot,warm" for default view

  // Get user's workspace memberships
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  const workspaceIds = memberships?.map((m) => m.workspace_id) || [];

  // Also check account_id based threads (for backward compatibility)
  let query = supabase
    .from("reply_threads")
    .select(
      `
      id,
      account_id,
      workspace_id,
      lead_id,
      campaign_id,
      latest_intent,
      status,
      last_message_at,
      snippet,
      unread_count,
      created_at,
      leads (
        id,
        email,
        name,
        first_name,
        last_name
      ),
      campaigns (
        id,
        name
      )
    `
    )
    .order("last_message_at", { ascending: false });

  // Apply workspace filter if available
  if (workspaceIds.length > 0) {
    query = query.in("workspace_id", workspaceIds);
  } else {
    // Fallback to account_id
    query = query.eq("account_id", user.id);
  }

  // Apply intent filter
  if (combinedFilter) {
    // Handle combined filter (e.g., "hot,warm" for default view)
    const intents = combinedFilter.split(",").map((i) => i.trim());
    query = query.in("latest_intent", intents);
  } else if (intentFilter !== "all") {
    query = query.eq("latest_intent", intentFilter);
  } else {
    // "all" - no filter, but exclude null/unclassified if needed
    // For "all", we show everything including unclassified
  }

  // Only show open/snoozed threads (not closed/archived)
  query = query.in("status", ["open", "snoozed"]);

  const { data: threads, error } = await query;

  if (error) {
    console.error("Inbox load error:", error);
    return NextResponse.json({ error: "Failed to load inbox" }, { status: 500 });
  }

  // Format threads for frontend
  const formattedThreads = (threads || []).map((thread: any) => {
    const lead = thread.leads as any;
    const leadName =
      lead?.name ||
      (lead?.first_name && lead?.last_name
        ? `${lead.first_name} ${lead.last_name}`.trim()
        : null) ||
      lead?.email ||
      "Homeowner";

    return {
      thread_id: thread.id,
      lead_id: thread.lead_id,
      lead: {
        id: lead?.id || thread.lead_id,
        email: lead?.email || "",
        name: leadName,
      },
      snippet: thread.snippet || "",
      intent: thread.latest_intent || "unclassified",
      status: thread.status || "open",
      last_at: thread.last_message_at || thread.created_at,
      unread_count: thread.unread_count || 0,
      campaign_id: thread.campaign_id,
      campaign_name: (thread.campaigns as any)?.name || null,
    };
  });

  // Sort by last_at descending (newest first)
  formattedThreads.sort(
    (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
  );

  return NextResponse.json(formattedThreads, { status: 200 });
}
