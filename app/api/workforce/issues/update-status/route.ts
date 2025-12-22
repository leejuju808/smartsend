// POST /api/workforce/issues/update-status
// Update issue status and trigger alerts if needed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Supabase credentials are not configured");
  }

  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const body = await req.json();

    const { issue_id, status } = body;

    if (!issue_id || !status) {
      return NextResponse.json(
        { error: "issue_id and status are required" },
        { status: 400 }
      );
    }

    // Validate status
    if (!['open', 'in_progress', 'resolved', 'dismissed'].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Get current issue to check severity
    const { data: currentIssue } = await supabase
      .from("crew_issues")
      .select("severity, status")
      .eq("id", issue_id)
      .single();

    // Update issue
    const updateData: any = {
      status,
    };

    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    } else {
      updateData.resolved_at = null;
    }

    const { data, error } = await supabase
      .from("crew_issues")
      .update(updateData)
      .eq("id", issue_id)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating issue:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger alert if status changed to critical or severity is high/critical
    if (status === 'in_progress' && (currentIssue?.severity === 'high' || currentIssue?.severity === 'critical')) {
      try {
        const alertUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/issue-created-alert`;
        await fetch(alertUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            issue_id: data.id,
            severity: currentIssue.severity,
            issue_type: data.issue_type,
            title: data.title,
            job_id: data.job_id,
            status: 'in_progress',
          }),
        }).catch((err) => {
          console.error("Failed to trigger alert:", err);
        });
      } catch (alertError) {
        console.error("Error triggering alert:", alertError);
      }
    }

    return NextResponse.json({ success: true, issue: data });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/issues/update-status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























