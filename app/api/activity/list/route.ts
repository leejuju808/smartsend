import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    workspaceId,
    campaignId,
    leadId,
    sequenceId,
    limit = 50,
    offset = 0,
  } = await req.json();

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  let query = supabase
    .from("workspace_activity_view")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (leadId) query = query.eq("lead_id", leadId);
  if (sequenceId) query = query.eq("sequence_id", sequenceId);

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching activity:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ events: data || [] }, { status: 200 });
}







