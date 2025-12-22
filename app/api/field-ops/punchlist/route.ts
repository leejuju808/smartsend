// Block 255400 — Field Operations Command v1
// API Route: Punchlist Management
// GET/POST /api/field-ops/punchlist

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get punchlist items for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const status = searchParams.get("status");

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (job) {
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", job.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    } else {
      // Try jobs table
      const { data: jobAlt } = await supabase
        .from("jobs")
        .select("id, team_id")
        .eq("id", jobId)
        .single();

      if (jobAlt) {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("team_id", jobAlt.team_id)
          .eq("user_id", user.id)
          .single();

        if (!teamMember) {
          return NextResponse.json(
            { error: "Access denied" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    // Build query
    let query = supabase
      .from("punchlists")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: punchlists, error: punchlistError } = await query;

    if (punchlistError) {
      console.error("Error fetching punchlists:", punchlistError);
      return NextResponse.json(
        { error: punchlistError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ punchlists: punchlists || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in punchlist get endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// POST: Create a new punchlist item
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      job_id,
      item,
      description,
      priority = "normal",
      category,
      ai_generated = false,
    } = body;

    if (!job_id || !item) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, item" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      // Try jobs table
      const { data: jobAlt, error: jobAltError } = await supabase
        .from("jobs")
        .select("id, team_id")
        .eq("id", job_id)
        .single();

      if (jobAltError || !jobAlt) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify team access
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("team_id", jobAlt.team_id)
        .eq("user_id", user.id)
        .single();

      if (!teamMember) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    } else {
      // Verify workspace access
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", job.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Insert punchlist item
    const { data: punchlist, error: insertError } = await supabase
      .from("punchlists")
      .insert({
        job_id,
        item,
        description: description || null,
        priority,
        category: category || null,
        ai_generated,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting punchlist:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ punchlist }, { status: 201 });
  } catch (error: any) {
    console.error("Error in punchlist post endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















