// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/issues/create
// Creates issue report - office gets instant notification
// Auto-generates change orders for certain issue types

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      jobId,
      crewId,
      dailyLogId,
      issueType,
      description,
      severity,
      photoUrl,
      requiresOfficeResponse,
    } = await req.json();

    if (!jobId || !issueType || !description) {
      return NextResponse.json(
        { error: "jobId, issueType, and description are required" },
        { status: 400 }
      );
    }

    // Create issue
    const { data: issue, error: issueError } = await supabase
      .from("crew_issues")
      .insert({
        job_id: jobId,
        crew_id: crewId || null,
        daily_log_id: dailyLogId || null,
        issue_type: issueType,
        description: description,
        severity: severity || "medium",
        photo_url: photoUrl || null,
        requires_office_response: requiresOfficeResponse !== undefined ? requiresOfficeResponse : true,
        status: "open",
      })
      .select()
      .single();

    if (issueError) {
      console.error("Issue creation error:", issueError);
      return NextResponse.json(
        { error: "Failed to create issue", details: issueError.message },
        { status: 500 }
      );
    }

    // Get job and workspace info for notifications
    const { data: job } = await supabase
      .from("jobs")
      .select("workspace_id, address, homeowner_name")
      .eq("id", jobId)
      .single();

    if (!job) {
      // Try roofing_jobs
      const { data: roofingJob } = await supabase
        .from("roofing_jobs")
        .select("workspace_id, address, homeowner_name")
        .eq("id", jobId)
        .single();
      
      if (roofingJob) {
        Object.assign(job, roofingJob);
      }
    }

    const workspaceId = job?.workspace_id;

    // Send notification to office
    if (workspaceId) {
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId);

      if (members) {
        for (const member of members) {
          await supabase.from("notifications").insert({
            user_id: member.user_id,
            workspace_id: workspaceId,
            type: "crew_issue_reported",
            title: `Crew Issue: ${issueType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}`,
            body: `Issue reported on job at ${job?.address || "Unknown"}: ${description}`,
            payload: {
              issue_id: issue.id,
              job_id: jobId,
              issue_type: issueType,
              severity: severity || "medium",
            },
            is_read: false,
          });
        }
      }
    }

    // Auto-generate change order for certain issue types
    let changeOrder = null;
    if (issueType === "decking_rot" || issueType === "extra_work" || issueType === "structural_issue") {
      // Check if change_orders table exists
      const { data: changeOrderData, error: coError } = await supabase
        .from("change_orders")
        .insert({
          job_id: jobId,
          member_id: crewId || null,
          description: `Auto-generated from crew issue: ${description}`,
          photo_id: photoUrl ? issue.id : null, // Link to issue photo if available
          suggested_price: null, // Will be calculated by office
          status: "pending",
        })
        .select()
        .single();

      if (!coError && changeOrderData) {
        changeOrder = changeOrderData;

        // Notify office about auto-generated change order
        if (workspaceId) {
          const { data: members } = await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspaceId);

          if (members) {
            for (const member of members) {
              await supabase.from("notifications").insert({
                user_id: member.user_id,
                workspace_id: workspaceId,
                type: "change_order_auto_generated",
                title: "Change Order Auto-Generated",
                body: `A change order has been auto-generated from a crew issue on job at ${job?.address || "Unknown"}.`,
                payload: {
                  change_order_id: changeOrderData.id,
                  issue_id: issue.id,
                  job_id: jobId,
                },
                is_read: false,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      issue,
      changeOrder,
      message: "Issue reported successfully. Office has been notified.",
    });
  } catch (error: any) {
    console.error("Create issue error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























