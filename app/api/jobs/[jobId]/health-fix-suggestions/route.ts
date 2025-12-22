// Block 24420 — SmartSend Roofing Job Health Score v2
// API Route: Get Job Health Fix Suggestions
// GET /api/jobs/[jobId]/health-fix-suggestions

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job and verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get pending fix suggestions
    const { data: suggestions, error: suggestionsError } = await supabase
      .from("job_health_fix_suggestions")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    if (suggestionsError) {
      console.error("Error fetching fix suggestions:", suggestionsError);
      return NextResponse.json(
        { error: "Failed to fetch fix suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: suggestions || [] });
  } catch (error: any) {
    console.error("Error in health-fix-suggestions API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH endpoint to apply or dismiss a suggestion
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;
    const body = await req.json();
    const { suggestionId, action } = body; // action: 'apply' or 'dismiss'

    if (!suggestionId || !action) {
      return NextResponse.json(
        { error: "Missing suggestionId or action" },
        { status: 400 }
      );
    }

    if (!["apply", "dismiss"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'apply' or 'dismiss'" },
        { status: 400 }
      );
    }

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get suggestion and verify access
    const { data: suggestion, error: suggestionError } = await supabase
      .from("job_health_fix_suggestions")
      .select("id, job_id, workspace_id")
      .eq("id", suggestionId)
      .eq("job_id", jobId)
      .single();

    if (suggestionError || !suggestion) {
      return NextResponse.json(
        { error: "Suggestion not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", suggestion.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update suggestion status
    const updateData: any = {
      status: action === "apply" ? "applied" : "dismissed",
    };

    if (action === "apply") {
      updateData.applied_at = new Date().toISOString();
      updateData.applied_by = user.id;
    }

    const { data: updatedSuggestion, error: updateError } = await supabase
      .from("job_health_fix_suggestions")
      .update(updateData)
      .eq("id", suggestionId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating suggestion:", updateError);
      return NextResponse.json(
        { error: "Failed to update suggestion" },
        { status: 500 }
      );
    }

    // If applied, recalculate health score
    if (action === "apply") {
      await supabase.rpc("calculate_job_health_score", {
        p_job_id: jobId,
      });
    }

    return NextResponse.json({ suggestion: updatedSuggestion });
  } catch (error: any) {
    console.error("Error in update suggestion:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































