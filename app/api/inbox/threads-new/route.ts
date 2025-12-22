import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const sb = createClient();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const filter = (searchParams.get("filter") || "all") as "all"|"unread"|"replied"|"awaiting";
  const campaignId = searchParams.get("campaignId");

  // First, get the base threads
  let query = sb
    .from("inbox_search")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }
  
  if (filter === "unread") {
    query = query.gt("unread_count", 0);
  }
  
  if (filter === "replied") {
    query = query.eq("replied", true);
  }
  
  if (filter === "awaiting") {
    query = query.eq("replied", false);
  }

  if (q) {
    // simple OR match - escape special characters in q
    const escapedQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or([
      `subject.ilike.%${escapedQ}%`,
      `lead_email.ilike.%${escapedQ}%`,
      `lead_name.ilike.%${escapedQ}%`,
      `company.ilike.%${escapedQ}%`,
      `last_body.ilike.%${escapedQ}%`
    ].join(","));
  }

  const { data: threads, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Get thread_ids to fetch lead_ids from email_threads
  const threadIds = (threads || []).map((t: any) => t.thread_id).filter(Boolean);
  
  // Fetch lead_ids from email_threads
  let threadToLeadMap: Record<string, string> = {};
  if (threadIds.length > 0) {
    const { data: emailThreads } = await sb
      .from("email_threads")
      .select("id, lead_id")
      .in("id", threadIds);
    
    if (emailThreads) {
      threadToLeadMap = emailThreads.reduce((acc: any, et: any) => {
        if (et.lead_id) {
          acc[et.id] = et.lead_id;
        }
        return acc;
      }, {});
    }
  }
  
  // Get unique lead_ids
  const leadIds = Array.from(new Set(Object.values(threadToLeadMap)));
  
  // Fetch lead statuses in batch
  let statusMap: Record<string, { status: string }> = {};
  if (leadIds.length > 0) {
    const { data: statuses } = await sb
      .from("lead_status")
      .select("lead_id, status")
      .in("lead_id", leadIds);
    
    if (statuses) {
      statusMap = statuses.reduce((acc: any, s: any) => {
        acc[s.lead_id] = { status: s.status };
        return acc;
      }, {});
    }
  }
  
  // Enrich threads with lead_id and status
  const enriched = (threads || []).map((thread: any) => {
    const leadId = threadToLeadMap[thread.thread_id];
    return {
      ...thread,
      lead_id: leadId || null,
      lead_status: leadId ? (statusMap[leadId] || null) : null,
    };
  });
  
  return NextResponse.json({ data: enriched });
}

