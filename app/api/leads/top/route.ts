// Block 21730 — SmartSend Roofing Lead Heat Score v1
// API Route — Get Top Leads by Heat Score
// GET /api/leads/top

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  let workspaceId: string | null = null;

  if (membership) {
    workspaceId = membership.workspace_id;
  } else {
    // Fallback: get first workspace if no default
    const { data: fallbackMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!fallbackMembership) {
      return NextResponse.json({ error: "No workspace" }, { status: 404 });
    }

    workspaceId = fallbackMembership.workspace_id;
  }

  // Get top leads by heat score
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, email, city, heat_score, status, first_name, last_name")
    .eq("workspace_id", workspaceId)
    .order("heat_score", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching top leads:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format the response
  const formatted = (data || []).map((lead) => ({
    id: lead.id,
    name: lead.name || lead.first_name || lead.email,
    email: lead.email,
    city: lead.city || "Unknown city",
    heat_score: lead.heat_score ?? 0,
    status: lead.status,
  }));

  return NextResponse.json(formatted);
}










































