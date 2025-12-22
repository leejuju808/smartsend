// Block 38900 — SmartSend Roofing Customer Portal v1
// API Route: POST /api/portal/create-session
// Generate magic link for homeowner portal access

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { lead_id, job_id, expires_in_days } = await req.json();

    if (!lead_id || !job_id) {
      return NextResponse.json(
        { error: "lead_id and job_id are required" },
        { status: 400 }
      );
    }

    // Verify user has access to this job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check if user is team member
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: teamMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", job.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Create portal session
    const { data: sessionData, error: sessionError } = await supabase.rpc(
      "create_portal_session",
      {
        p_lead_id: lead_id,
        p_job_id: job_id,
        p_expires_in_days: expires_in_days || 7,
      }
    );

    if (sessionError) {
      console.error("Error creating portal session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create portal session" },
        { status: 500 }
      );
    }

    // Build portal URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000";
    const portalUrl = `${baseUrl}/portal?token=${sessionData.token}`;

    return NextResponse.json({
      ok: true,
      url: portalUrl,
      token: sessionData.token,
      expires_at: sessionData.expires_at,
    });
  } catch (error: any) {
    console.error("Error in /api/portal/create-session:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































