import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/safety/incident - Create an incident report
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

    const {
      job_id,
      date,
      type,
      description,
      severity,
      immediate_action,
      follow_up_required,
      follow_up_notes,
      images,
    } = await req.json();

    if (!date || !type || !description || !severity) {
      return NextResponse.json(
        { error: "Missing required fields: date, type, description, severity" },
        { status: 400 }
      );
    }

    if (!["Injury", "Property Damage", "Near Miss"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be: Injury, Property Damage, or Near Miss" },
        { status: 400 }
      );
    }

    if (!["Low", "Medium", "High", "Critical"].includes(severity)) {
      return NextResponse.json(
        { error: "Invalid severity. Must be: Low, Medium, High, or Critical" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("incident_reports")
      .insert({
        workspace_id: workspaceId,
        job_id: job_id || null,
        reported_by: user.id,
        date,
        type,
        description,
        severity,
        immediate_action: immediate_action || null,
        follow_up_required: follow_up_required || false,
        follow_up_notes: follow_up_notes || null,
        images: images || [],
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating incident report:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If severity is High or Critical, mark job as safety flagged
    if (severity === "High" || severity === "Critical") {
      if (job_id) {
        // Update job metadata to flag safety issue
        await supabase
          .from("roofing_jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", job_id);
      }

      // In a real implementation, you'd send an urgent alert to the owner here
      console.log(`URGENT: ${severity} incident reported - ${type}`);
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("Error in POST /api/safety/incident:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/safety/incident - Get incident reports
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
    const severity = searchParams.get("severity");
    const type = searchParams.get("type");

    let query = supabase
      .from("incident_reports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (severity) {
      query = query.eq("severity", severity);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching incident reports:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/incident:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























