import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { lead_id, start_time, end_time, location, notes } = body;

    if (!lead_id || !start_time) {
      return NextResponse.json(
        { error: "lead_id and start_time required" },
        { status: 400 }
      );
    }

    // Ensure lead belongs to this user (via RLS or explicit check)
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get user_id from lead (may be in user_id, workspace_id, or team_id)
    let userId = lead.user_id || user.id;
    if (!lead.user_id && lead.workspace_id) {
      // Get first workspace member as user_id
      const { data: member } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", lead.workspace_id)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (member) userId = member.user_id;
    }
    if (!lead.user_id && lead.team_id) {
      // Get first team member as user_id
      const { data: member } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", lead.team_id)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (member) userId = member.user_id;
    }

    // Create estimate
    const { data: estimate, error: estError } = await supabase
      .from("estimates")
      .insert({
        user_id: userId,
        lead_id,
        start_time,
        end_time: end_time || null,
        location: location || "On-site",
        notes: notes || "",
        source: "manual",
      })
      .select("*")
      .single();

    if (estError) {
      console.error("manual estimate error:", estError);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    // Move pipeline + log
    const { error: stageError } = await supabase.rpc("mark_estimate_scheduled", {
      p_lead_id: lead_id,
      p_when: start_time,
    });

    if (stageError) {
      console.error("mark_estimate_scheduled error:", stageError);
      // Don't fail the request, but log the error
    }

    return NextResponse.json({ status: "ok", estimate });
  } catch (error) {
    console.error("Error creating estimate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}














































