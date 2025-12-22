import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { workspaceId } = await req.json();

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("campaign_stats_summary")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("total_sent", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ campaigns: data || [] }, { status: 200 });
}







