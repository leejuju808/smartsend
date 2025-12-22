// Block 21731 — SmartSend Roofing Lead Dashboard v1
// Top 10 Hottest Leads API

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  try {
    // Get top 10 hottest leads ordered by heat_score
    // Note: city might not exist in all leads tables, so we'll select it if available
    const { data, error } = await supabase
      .from("leads")
      .select("id, name, email, heat_score, status")
      .eq("workspace_id", workspaceId)
      .not("status", "in", "(lost,won,not_interested,out_of_scope)")
      .order("heat_score", { ascending: false, nullsLast: true })
      .limit(10);

    if (error) {
      console.error("Top leads error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Top leads API error:", error);
    return NextResponse.json(
      { error: "Failed to load top leads" },
      { status: 500 }
    );
  }
}

