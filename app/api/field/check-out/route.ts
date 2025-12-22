// Block 22750 — SmartSend Roofing Field App v1
// API Route: Check Out from a Job
// POST /api/field/check-out
// Calls the edge function to update progress and timeline

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const { field_session_id, job_id, workspace_id, progress_percent, notes } = await req.json();

    if (!field_session_id || !job_id || !workspace_id) {
      return NextResponse.json(
        { error: "field_session_id, job_id, and workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Call the edge function to handle check-out
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const functionUrl = `${supabaseUrl}/functions/v1/field-checkout`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        field_session_id,
        job_id,
        workspace_id,
        progress_percent: progress_percent ?? null,
        notes: notes || null,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to check out" },
        { status: response.status }
      );
    }

    return NextResponse.json(
      { ...result, message: "Checked out successfully" },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in field check-out API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































