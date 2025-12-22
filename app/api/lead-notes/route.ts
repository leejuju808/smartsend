import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      lead_id,
      note_type,
      title,
      body: text,
      score_delta,
      is_pinned,
    } = body;

    if (!lead_id || !text) {
      return NextResponse.json(
        { error: "lead_id and body are required" },
        { status: 400 },
      );
    }

    const supabase = createClient();
    
    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Get lead to verify access and get workspace_id
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 },
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("workspace_id", lead.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No access to this workspace" },
        { status: 403 },
      );
    }

    // Get user name for created_by_name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const createdByName = profile?.full_name || profile?.email || null;

    const { data, error } = await supabase
      .from("lead_notes")
      .insert({
        lead_id,
        workspace_id: lead.workspace_id,
        author_id: user.id,
        user_id: user.id, // Keep for backward compatibility
        note_type: note_type || "context",
        title: title || null,
        body: text,
        score_delta: score_delta ?? null,
        is_pinned: !!is_pinned,
        pinned: !!is_pinned, // Keep for backward compatibility
        created_by_name: createdByName,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "insert_failed", details: error },
        { status: 500 },
      );
    }

    // Optional: log to activity timeline
    await supabase.from("lead_activity_events").insert({
      lead_id,
      event_type: "note_added",
      source: "user",
      related_table: "lead_notes",
      related_id: data.id,
      payload: {
        note_type: data.note_type,
        score_delta: data.score_delta,
        is_pinned: data.is_pinned,
      },
    });

    return NextResponse.json({ note: data });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

