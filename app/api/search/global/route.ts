import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query, workspaceId, limit = 5 } = await req.json();

  const q = (query || "").trim();
  if (!q) {
    return NextResponse.json(
      { leads: [], campaigns: [], replies: [], meetings: [], activity: [] },
      { status: 200 }
    );
  }

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 }
    );
  }

  const like = `%${q}%`;

  // Leads
  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, email, company, status")
    .eq("workspace_id", workspaceId)
    .or(
      `email.ilike.${like},company.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`
    )
    .limit(limit);

  // Campaigns
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("workspace_id", workspaceId)
    .ilike("name", like)
    .limit(limit);

  // Replies (by body + lead email/company)
  const { data: replies } = await supabase
    .from("inbox_replies_view")
    .select(
      "reply_id, lead_id, body, received_at, lead_email, company, category"
    )
    .eq("workspace_id", workspaceId)
    .or(
      `body.ilike.${like},lead_email.ilike.${like},company.ilike.${like}`
    )
    .order("received_at", { ascending: false })
    .limit(limit);

  // Meetings
  const { data: meetings } = await supabase
    .from("meeting_pipeline_view")
    .select("id, lead_id, title, start_time, status, first_name, last_name, company")
    .eq("workspace_id", workspaceId)
    .or(
      `title.ilike.${like},company.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`
    )
    .order("start_time", { ascending: true })
    .limit(limit);

  // Activity
  const { data: activity } = await supabase
    .from("workspace_activity_view")
    .select("id, event_type, description, created_at, campaign_name, lead_email, lead_company")
    .eq("workspace_id", workspaceId)
    .or(
      `description.ilike.${like},campaign_name.ilike.${like},lead_email.ilike.${like},lead_company.ilike.${like}`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return NextResponse.json(
    {
      leads: leads || [],
      campaigns: campaigns || [],
      replies: replies || [],
      meetings: meetings || [],
      activity: activity || [],
    },
    { status: 200 }
  );
}







