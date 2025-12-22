import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/safety/toolbox-talk - Create a new toolbox talk
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const { job_id, date, topic, notes } = await req.json();

    if (!date || !topic) {
      return NextResponse.json(
        { error: "Missing required fields: date, topic" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("toolbox_talks")
      .insert({
        workspace_id: workspaceId,
        job_id: job_id || null,
        date,
        topic,
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating toolbox talk:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("Error in POST /api/safety/toolbox-talk:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/safety/toolbox-talk - Get toolbox talks
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const date = searchParams.get("date");

    let query = supabase
      .from("toolbox_talks")
      .select(`
        *,
        toolbox_attendance (
          id,
          crew_member_name,
          signature_url,
          signed_at
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (date) {
      query = query.eq("date", date);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching toolbox talks:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/toolbox-talk:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























