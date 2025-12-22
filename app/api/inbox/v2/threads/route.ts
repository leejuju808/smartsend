// Block 19680 — Inbox Performance Optimizer v1
// GET /api/inbox/v2/threads
// Returns threads with cursor-based pagination, optimized queries, and lightweight payload

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") || "all"; // all, hot, new_replies, follow_up, warm, not_interested
  const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 50); // Cap at 50, default 25
  const cursor = searchParams.get("cursor"); // Cursor: "last_message_at|id" format
  const search = searchParams.get("search")?.trim(); // Optional search term
  const campaignId = searchParams.get("campaign_id");
  const includeLowQuality = searchParams.get("include_low_quality") === "1";

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  const workspaceId = membership?.workspace_id;

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Parse cursor if provided (format: "timestamp|id")
  let cursorTimestamp: string | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const [ts, id] = cursor.split("|");
    cursorTimestamp = ts || null;
    cursorId = id || null;
  }

  // Build query using the optimized view
  // Select only essential columns for list view performance
  let query = supabase
    .from("v_inbox_v2_threads")
    .select(`
      id,
      lead_id,
      campaign_id,
      pinned,
      pinned_at,
      latest_intent,
      status,
      unread_count,
      last_message_at,
      snippet,
      has_notes,
      suppressed,
      lead_email,
      first_name,
      last_name,
      lead_name,
      city,
      state,
      campaign_name,
      lead_status,
      has_tasks,
      estimated_value
    `)
    .eq("workspace_id", workspaceId)
    .order("pinned", { ascending: false })
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1); // Fetch one extra to determine if there's more

  // Apply cursor-based pagination
  if (cursorTimestamp && cursorId) {
    // For cursor pagination with pinned threads, we need to handle pinned separately
    // If cursor exists, we're past the pinned section, so filter out pinned
    query = query.eq("pinned", false);
    // Apply cursor filter: last_message_at <= cursor, then filter client-side if needed
    // For simplicity, we'll use last_message_at < cursor (strictly less than)
    // This ensures we don't get duplicates
    const cursorDate = new Date(cursorTimestamp);
    query = query.lt("last_message_at", cursorDate.toISOString());
  }

  // Apply filters
  if (filter === "hot") {
    query = query.eq("latest_intent", "HOT");
  } else if (filter === "new_replies") {
    query = query.gt("unread_count", 0);
  } else if (filter === "follow_up") {
    query = query.eq("latest_intent", "FOLLOW_UP");
  } else if (filter === "warm") {
    query = query.eq("latest_intent", "WARM");
  } else if (filter === "not_interested") {
    query = query.eq("latest_intent", "NOT_INTERESTED");
  }
  // "all" shows everything

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  // Note: Search would require full-text search index - deferring to v2
  // For now, search can be handled client-side or via a separate search endpoint

  const { data: threads, error } = await query;

  if (error) {
    console.error("Inbox v2 threads error:", error);
    return NextResponse.json({ error: "Failed to load threads" }, { status: 500 });
  }

  // Check if there are more results
  const hasMore = threads && threads.length > limit;
  const threadsToReturn = hasMore ? threads.slice(0, limit) : (threads || []);

  // Attach lead quality + optionally filter low quality (best-effort)
  type LeadQualityRow = {
    lead_id: string;
    quality_score: number | null;
    lead_type: string | null;
    urgency: string | null;
    intent: string | null;
    risk_flags: string[] | null;
  };

  const leadIds = [...new Set((threadsToReturn || []).map((t: any) => String(t.lead_id)).filter(Boolean))];
  const qualityByLeadId = new Map<string, LeadQualityRow>();

  if (leadIds.length > 0) {
    try {
      const { data: qualityRows } = await supabase
        .from("lead_quality")
        .select("lead_id, quality_score, lead_type, urgency, intent, risk_flags")
        .in("lead_id", leadIds);

      for (const row of (qualityRows || []) as any[]) {
        if (row?.lead_id) qualityByLeadId.set(String(row.lead_id), row as LeadQualityRow);
      }
    } catch {
      // ignore (quality is additive)
    }
  }

  const isLowQuality = (q: LeadQualityRow | undefined) => {
    if (!q) return false; // unknown => keep
    const score = typeof q.quality_score === "number" ? q.quality_score : null;
    const leadType = (q.lead_type || "").toLowerCase();
    const intent = (q.intent || "").toLowerCase();

    if (leadType === "bad_lead" || leadType === "out_of_service_area" || leadType === "rental_tenant") return true;
    if (intent === "not_interested") return true;
    if (score != null && score < 40) return true;
    return false;
  };

  const filteredThreads = includeLowQuality
    ? threadsToReturn
    : (threadsToReturn || []).filter((t: any) => !isLowQuality(qualityByLeadId.get(String(t.lead_id))));

  const filteredLowQualityCount = (threadsToReturn || []).length - (filteredThreads || []).length;

  // Generate next cursor from last item
  let nextCursor: string | null = null;
  if (hasMore && filteredThreads.length > 0) {
    const lastThread = filteredThreads[filteredThreads.length - 1] as any;
    nextCursor = `${lastThread.last_message_at}|${lastThread.id}`;
  }

  // Format threads for frontend - lightweight payload
  const formattedThreads = filteredThreads.map((thread: any) => {
    const q = qualityByLeadId.get(String(thread.lead_id));
    return {
      id: thread.id,
      lead_id: thread.lead_id,
      campaign_id: thread.campaign_id,
      pinned: thread.pinned,
      pinned_at: thread.pinned_at,
      latest_intent: thread.latest_intent || "UNCLASSIFIED",
      status: thread.status,
      unread_count: thread.unread_count || 0,
      last_message_at: thread.last_message_at,
      snippet: thread.snippet || "",
      has_notes: thread.has_notes || false,
      suppressed: thread.suppressed || false,
      lead: {
        id: thread.lead_id,
        email: thread.lead_email,
        name: thread.lead_name || "Homeowner",
        first_name: thread.first_name,
        last_name: thread.last_name,
        city: thread.city,
        state: thread.state,
        quality_score: q?.quality_score ?? null,
        lead_type: q?.lead_type ?? null,
      },
      campaign: thread.campaign_name
        ? {
            id: thread.campaign_id,
            name: thread.campaign_name,
          }
        : null,
      lead_status: thread.lead_status || "NEW",
      has_tasks: thread.has_tasks || false,
      estimated_value: thread.estimated_value,
    };
  });

  return NextResponse.json({
    threads: formattedThreads,
    pagination: {
      limit,
      cursor: nextCursor,
      has_more: hasMore,
    },
    meta: {
      filtered_low_quality: filteredLowQualityCount,
      include_low_quality: includeLowQuality,
    },
  });
}



