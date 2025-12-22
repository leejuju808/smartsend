import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Get user's org_id from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 400 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const status = url.searchParams.get("status") || "any"; // Any | Replied | NotReplied
  const org_id = profile.org_id;
  const page = parseInt(url.searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);

  // Use view_lead_priority to get leads with scores
  let query = supabase
    .from("view_lead_priority")
    .select("lead_id, org_id, first_name, last_name, email, company, status, engagement_score, intent_score, priority, created_at", { count: "exact" })
    .eq("org_id", org_id);

  if (q) {
    query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,company.ilike.%${q}%`);
  }

  if (status === "Replied") {
    query = query.eq("status", "Replied");
  } else if (status === "NotReplied") {
    query = query.neq("status", "Replied");
  }

  query = query
    .order("priority", { ascending: false, nullsLast: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
  // Map to expected format
  const rows = (data ?? []).map(row => ({
    id: row.lead_id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    company: row.company,
    status: row.status,
    priority: row.priority || 0,
    engagement_score: row.engagement_score || 0,
    intent_score: row.intent_score || 0,
    created_at: row.created_at,
  }));
  
  return NextResponse.json({ items: rows, total: count ?? 0 });
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { campaignId, status, search, page = 1, pageSize = 25 } = await req.json();

  let query = supabase
    .from('leads')
    .select('id,email,first_name,last_name,company,title,status,attempts,max_attempts,created_at,enrichment_status', { count: 'exact' })
    .eq('campaign_id', campaignId);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rows: data || [], total: count ?? 0 });
}
