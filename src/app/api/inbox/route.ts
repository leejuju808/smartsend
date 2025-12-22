// @ts-nocheck
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type ThreadRow = {
  id: string;
  subject: string | null;
  last_ai_label: string | null;
  updated_at: string;
  status: string;
  campaign_id: string;
  assigned_to: string | null;
  last_message_at: string | null;
  unread_inbound: number | null;
  stopped_by_reply: boolean | null;
};

function applyTabFilter(q: any, tab: string | null) {
  switch (tab) {
    case "needs":
      // Needs Reply: exclude unsub/ooo/bounce; exclude closed
      // Filter: status != 'closed' AND (last_ai_label IS NULL OR last_ai_label NOT IN excluded list)
      // PostgREST: use .or() with proper grouping
      return q
        .neq("status", "closed")
        .or("last_ai_label.is.null,last_ai_label.neq.unsubscribe,last_ai_label.neq.ooo,last_ai_label.neq.bounce");
    case "interested":
      return q.eq("last_ai_label", "positive");
    case "system":
      // Unsub/OOO/Bounce bucket
      return q.in("last_ai_label", ["unsubscribe", "ooo", "bounce"]);
    case "all":
    case null:
    default:
      return q;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab"); // all|needs|interested|system
  const label = url.searchParams.get("label"); // existing label filter can still apply
  const assignee = url.searchParams.get("assignee"); // existing
  const campaignId = url.searchParams.get("campaign_id") || url.searchParams.get("campaign"); // optional scope

  // New search and filter params
  const q = url.searchParams.get("q");
  const status = url.searchParams.get("status"); // open|closed|snoozed|any
  const hasAttach = url.searchParams.get("has_attach") === "1";
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Get list of campaign IDs the user has access to (owned or member)
  const { data: membership } = await supabase
    .from("campaign_members")
    .select("campaign_id")
    .eq("user_id", user.id);

  const sharedCampaignIds = membership?.map((m) => m.campaign_id) ?? [];

  // Also get campaigns where user is owner
  const { data: ownedCampaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("owner_id", user.id);

  const ownedCampaignIds = ownedCampaigns?.map((c) => c.id) ?? [];
  const accessibleCampaignIds = [...new Set([...sharedCampaignIds, ...ownedCampaignIds])];

  // Simple campaign-specific query (as specified in user requirements)
  if (campaignId && !tab && !assignee && !status && !hasAttach && !dateFrom && !dateTo) {
    const qLower = (q || "").toLowerCase();
    const labelFilter = label || "all";

    // Pull threads with last inbound label and join lead + last subject
    let { data: base, error } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id, lead_id, subject, updated_at, replied_at, stopped_by_reply")
      .eq("campaign_id", campaignId)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: String(error) }, { status: 500 });

    const threadIds = base?.map(b => b.id) ?? [];
    const { data: last } = await supabase
      .from("v_thread_last_inbound")
      .select("thread_id,last_inbound_at,last_label,last_confidence")
      .in("thread_id", threadIds);

    const lastMap = new Map((last ?? []).map((l: any) => [l.thread_id, l]));
    // Optionally fetch lead emails
    const { data: leads } = await supabase
      .from("leads")
      .select("id,email")
      .in("id", base?.map(b=>b.lead_id).filter(Boolean) ?? []);
    const emailMap = new Map((leads ?? []).map((l: any) => [l.id, l.email]));

    // Filter client-side (for simplicity)
    let rows = (base ?? []).map(b => ({
      thread_id: b.id,
      subject: b.subject,
      updated_at: b.updated_at,
      stopped_by_reply: b.stopped_by_reply,
      replied_at: b.replied_at,
      last_inbound_at: lastMap.get(b.id)?.last_inbound_at ?? null,
      last_label: lastMap.get(b.id)?.last_label ?? null,
      lead_email: emailMap.get(b.lead_id) ?? null
    }));

    if (labelFilter !== "all") rows = rows.filter(r => r.last_label === labelFilter);
    if (qLower) {
      rows = rows.filter(r =>
        (r.lead_email || "").toLowerCase().includes(qLower) ||
        (r.subject || "").toLowerCase().includes(qLower)
      );
    }

    return NextResponse.json({ rows }, { headers: { "content-type":"application/json" } });
  }

  // Base query (respect RLS: can_view_campaign)
  // Use score_v2 for AI-powered sorting (reply likelihood), fallback to score_v3, then last_message_at
  let threads = supabase
    .from("inbox_threads")
    .select(`
      id, subject, last_ai_label, last_ai_intent, updated_at, status, campaign_id, assigned_to, last_message_at, stopped_by_reply, replied_at, snooze_until, cooldown_until, unread_inbound,
      leads:lead_id (do_not_contact, email_status, score_v2, score_v3)
    `)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (campaignId) {
    threads = threads.eq("campaign_id", campaignId);
  } else {
    // Filter by accessible campaigns (shared inbox rights)
    if (accessibleCampaignIds.length > 0) {
      threads = threads.in("campaign_id", accessibleCampaignIds);
    } else {
      // No accessible campaigns, return empty
      return NextResponse.json({ rows: [], counts: {} });
    }
  }

  // Tab filter
  threads = applyTabFilter(threads, tab);

  // Optional extra filters (label, assignee)
  if (label && label !== "All") threads = threads.eq("last_ai_label", label);

  if (assignee === "unassigned") threads = threads.is("assigned_to", null);
  else if (assignee === "me") {
    if (user?.id) threads = threads.eq("assigned_to", user.id);
  } else if (assignee) threads = threads.eq("assigned_to", assignee);

  // Status filter
  if (status && status !== "any") threads = threads.eq("status", status);

  // Date range filter (applied via last_message_at for speed)
  if (dateFrom) threads = threads.gte("last_message_at", dateFrom);
  if (dateTo) threads = threads.lte("last_message_at", dateTo);

  // Execute thread query first
  const { data: list, error } = await threads;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // If no keyword search and no attachment filter, we can return early
  if (!q && !hasAttach) {
    // Get counts for badges
    const counts = await (async () => {
      const counts: Record<string, number> = {
        all: 0,
        needs: 0,
        interested: 0,
        system: 0,
      };

      // Scope counts to same campaign (if provided)
      const scope = (q: any) => {
        let scoped = q.select("id", { count: "exact", head: true });
        if (campaignId) scoped = scoped.eq("campaign_id", campaignId);
        return scoped;
      };

      // all
      const { count: allCount } = await scope(
        supabase.from("inbox_threads")
      );
      counts.all = allCount ?? 0;

      // needs
      const { count: needsCount } = await scope(
        supabase
          .from("inbox_threads")
          .neq("status", "closed")
          .or("last_ai_label.is.null,last_ai_label.neq.unsubscribe,last_ai_label.neq.ooo,last_ai_label.neq.bounce")
      );
      counts.needs = needsCount ?? 0;

      // interested
      const { count: interestedCount } = await scope(
        supabase.from("inbox_threads").eq("last_ai_label", "positive")
      );
      counts.interested = interestedCount ?? 0;

      // system
      const { count: systemCount } = await scope(
        supabase
          .from("inbox_threads")
          .in("last_ai_label", ["unsubscribe", "ooo", "bounce"])
      );
      counts.system = systemCount ?? 0;

      return counts;
    })();

    // Sort threads by score_v2 (AI reply likelihood) if available, fallback to score_v3, then last_message_at
    const sortedList = (list || []).sort((a: any, b: any) => {
      // Prefer score_v2 (AI-powered reply likelihood)
      const aScoreV2 = a.leads?.score_v2 ?? null;
      const bScoreV2 = b.leads?.score_v2 ?? null;
      if (aScoreV2 !== null && bScoreV2 !== null && aScoreV2 !== bScoreV2) {
        return bScoreV2 - aScoreV2; // Higher score first
      }
      // Fallback to score_v3 if v2 not available
      const aScoreV3 = a.leads?.score_v3 ?? 0;
      const bScoreV3 = b.leads?.score_v3 ?? 0;
      if (aScoreV3 !== bScoreV3) {
        return bScoreV3 - aScoreV3; // Higher score first
      }
      // Final fallback to last_message_at
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ threads: sortedList as ThreadRow[], counts });
  }

  // Filter by attachments if requested
  let filteredList = list || [];
  if (hasAttach) {
    // Only threads that have an inbound or outbound message with attachments
    const { data: attachIds } = await supabase
      .from("inbox_messages")
      .select("thread_id")
      .eq("has_attachments", true)
      .limit(5000);
    
    const allowSet = new Set((attachIds || []).map((a) => a.thread_id));
    filteredList = filteredList.filter((t) => allowSet.has(t.id));
  }

  // Keyword search: find matching thread_ids via messages FTS
  if (!q) {
    // Get counts if no search
    const counts = await (async () => {
      const counts: Record<string, number> = {
        all: 0,
        needs: 0,
        interested: 0,
        system: 0,
      };
      // Scope counts to same campaign (if provided)
      const scope = (q: any) => {
        let scoped = q.select("id", { count: "exact", head: true });
        if (campaignId) scoped = scoped.eq("campaign_id", campaignId);
        return scoped;
      };
      const { count: allCount } = await scope(supabase.from("inbox_threads"));
      counts.all = allCount ?? 0;
      const { count: needsCount } = await scope(
        supabase
          .from("inbox_threads")
          .neq("status", "closed")
          .or("last_ai_label.is.null,last_ai_label.neq.unsubscribe,last_ai_label.neq.ooo,last_ai_label.neq.bounce")
      );
      counts.needs = needsCount ?? 0;
      const { count: interestedCount } = await scope(
        supabase.from("inbox_threads").eq("last_ai_label", "positive")
      );
      counts.interested = interestedCount ?? 0;
      const { count: systemCount } = await scope(
        supabase
          .from("inbox_threads")
          .in("last_ai_label", ["unsubscribe", "ooo", "bounce"])
      );
      counts.system = systemCount ?? 0;
      return counts;
    })();
    return NextResponse.json({ threads: filteredList as ThreadRow[], counts });
  }

  // Simple tsquery: split by space AND; sanitize input
  const tokens = q
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => t.replace(/[:&|!()]/g, "")); // sanitize

  // If tokens empty after sanitize, return filtered list
  if (!tokens.length) {
    const counts = await (async () => {
      const counts: Record<string, number> = { all: 0, needs: 0, interested: 0, system: 0 };
      const scope = (q: any) => {
        let scoped = q.select("id", { count: "exact", head: true });
        if (campaignId) scoped = scoped.eq("campaign_id", campaignId);
        return scoped;
      };
      const { count: allCount } = await scope(supabase.from("inbox_threads"));
      counts.all = allCount ?? 0;
      const { count: needsCount } = await scope(
        supabase
          .from("inbox_threads")
          .neq("status", "closed")
          .or("last_ai_label.is.null,last_ai_label.neq.unsubscribe,last_ai_label.neq.ooo,last_ai_label.neq.bounce")
      );
      counts.needs = needsCount ?? 0;
      const { count: interestedCount } = await scope(
        supabase.from("inbox_threads").eq("last_ai_label", "positive")
      );
      counts.interested = interestedCount ?? 0;
      const { count: systemCount } = await scope(
        supabase.from("inbox_threads").in("last_ai_label", ["unsubscribe", "ooo", "bounce"])
      );
      counts.system = systemCount ?? 0;
      return counts;
    })();
    return NextResponse.json({ threads: filteredList as ThreadRow[], counts });
  }

  // Build query: use RPC for better search or fallback to simple tsquery
  const ts = tokens.join(" & ");
  
  // Option 1: Use RPC function for better search ranking (if available)
  // Option 2: Fallback to direct query with tsquery
  let hitSet: Set<string>;
  
  try {
    // Try RPC first (websearch_to_tsquery supports quotes, OR, -excludes)
    const { data: rpcResults, error: rpcError } = await supabase
      .rpc("search_threads", { p_query: q, p_limit: 200 });
    
    if (!rpcError && rpcResults) {
      hitSet = new Set(rpcResults.map((r: { thread_id: string }) => r.thread_id));
    } else {
      // Fallback: direct query with simple tsquery
      const { data: hitMsgs } = await supabase
        .from("inbox_messages")
        .select("thread_id")
        .textSearch("fts", ts, { type: "websearch", config: "simple" })
        .limit(2000);
      
      hitSet = new Set((hitMsgs || []).map((m) => m.thread_id));
    }
  } catch (err) {
    // Fallback if RPC doesn't exist or textSearch not available
    // Use simple pattern matching as last resort
    const { data: hitMsgs } = await supabase
      .from("inbox_messages")
      .select("thread_id")
      .or(`subject.ilike.%${tokens[0]}%,body.ilike.%${tokens[0]}%`)
      .limit(2000);
    
    hitSet = new Set((hitMsgs || []).map((m) => m.thread_id));
  }

  const searchFiltered = filteredList.filter((t) => hitSet.has(t.id));

  // Return without counts when searching (counts don't apply to search results)
  return NextResponse.json({ threads: searchFiltered as ThreadRow[], counts: null });
}