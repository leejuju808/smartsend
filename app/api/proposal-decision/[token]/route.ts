// Block 27210 — SmartSend Roofing E-Sign & Acceptance Tracker v1
// API Route: Record Accept/Decline Decision
// POST /api/proposal-decision/[token]

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const {
      decision,
      homeowner_name,
      homeowner_email,
      homeowner_notes,
    } = await req.json();

    if (!decision || !["accepted", "declined"].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision. Must be 'accepted' or 'declined'" },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceClient();

    // Get token row
    const { data: tokenRow, error: tokenError } = await serviceSupabase
      .from("roofing_proposal_tokens")
      .select("*")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (tokenError || !tokenRow) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 404 }
      );
    }

    // Check if token is expired
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Token has expired" },
        { status: 410 }
      );
    }

    const jobId = tokenRow.job_id;

    // Basic IP capture from header
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const ip =
      (forwardedFor?.split(",")[0]?.trim() || realIp || null) ?? null;

    // Insert acceptance record
    const { error: acceptanceError } = await serviceSupabase
      .from("roofing_proposal_acceptances")
      .insert({
        job_id: jobId,
        proposal_tier: tokenRow.proposal_tier,
        token,
        decision,
        homeowner_name: homeowner_name || null,
        homeowner_email: homeowner_email || null,
        homeowner_ip: ip,
        homeowner_notes: homeowner_notes || null,
      });

    if (acceptanceError) {
      console.error("Error recording acceptance:", acceptanceError);
      return NextResponse.json(
        { error: "Failed to record decision" },
        { status: 500 }
      );
    }

    // If accepted → update job + trigger tasks
    if (decision === "accepted") {
      // Update job status
      const { error: jobUpdateError } = await serviceSupabase
        .from("roofing_jobs")
        .update({
          status: "accepted",
          selected_tier: tokenRow.proposal_tier,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (jobUpdateError) {
        console.error("Error updating job:", jobUpdateError);
        // Don't fail the request, but log the error
      }

      // Deactivate token after acceptance
      await serviceSupabase
        .from("roofing_proposal_tokens")
        .update({ is_active: false })
        .eq("token", token);

      // TODO: Insert into tasks table → schedule production + invoice deposit
      // This would be done via triggers or separate API calls
      // Example:
      // await serviceSupabase.from("roofing_tasks").insert([
      //   {
      //     workspace_id: job.workspace_id,
      //     job_id: jobId,
      //     category: "job",
      //     title: "Schedule production",
      //     description: "Job accepted - schedule production",
      //     priority: "high",
      //     due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      //   },
      //   {
      //     workspace_id: job.workspace_id,
      //     job_id: jobId,
      //     category: "job",
      //     title: "Request deposit/invoice",
      //     description: "Job accepted - request deposit",
      //     priority: "high",
      //     due_date: new Date().toISOString().split("T")[0],
      //   },
      // ]);
    }

    return NextResponse.json({ success: true, decision });
  } catch (error: any) {
    console.error("Error recording proposal decision:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































