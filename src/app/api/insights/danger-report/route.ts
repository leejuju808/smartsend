import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/insights/danger-report
 * Get daily "Danger Report" - priority list of issues needing attention
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Get cached danger report
    const { data: dangerReport } = await supabaseAdmin
      .from("insights_danger_report")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("report_date", date)
      .maybeSingle();

    if (dangerReport) {
      return NextResponse.json({
        report_date: dangerReport.report_date,
        generated_at: dangerReport.generated_at,
        total_danger_items: dangerReport.total_danger_items || 0,
        priority_breakdown: {
          high: dangerReport.high_priority_count || 0,
          medium: dangerReport.medium_priority_count || 0,
          low: dangerReport.low_priority_count || 0,
        },
        revenue_at_risk: Number(dangerReport.revenue_at_risk || 0),
        danger_items: dangerReport.danger_items || [],
      });
    }

    // If no cached report, generate on-the-fly
    const dangerItems: any[] = [];

    // 1. Hot leads not contacted in 24 hours
    const { data: hotLeadsNotContacted } = await supabaseAdmin
      .from("contacts")
      .select("id, email, first_name, last_name, pipeline_stage_key, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("pipeline_stage_key", "hot_leads")
      .lt("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(10);

    if (hotLeadsNotContacted && hotLeadsNotContacted.length > 0) {
      dangerItems.push({
        type: "hot_lead_not_contacted",
        count: hotLeadsNotContacted.length,
        priority: "high",
        items: hotLeadsNotContacted.map((lead) => ({
          id: lead.id,
          email: lead.email,
          name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email,
        })),
      });
    }

    // 2. Insurance leads needing adjuster prep
    const { data: insuranceLeadsNeedingPrep } = await supabaseAdmin
      .from("insurance_metadata")
      .select("contact_id, claim_number, adjuster_name, adjuster_scheduled_at")
      .eq("workspace_id", workspaceId)
      .eq("has_insurance_claim", true)
      .not("adjuster_scheduled_at", "is", null)
      .limit(10);

    if (insuranceLeadsNeedingPrep && insuranceLeadsNeedingPrep.length > 0) {
      dangerItems.push({
        type: "insurance_lead_needs_adjuster_prep",
        count: insuranceLeadsNeedingPrep.length,
        priority: "high",
        items: insuranceLeadsNeedingPrep.map((lead) => ({
          contact_id: lead.contact_id,
          claim_number: lead.claim_number,
          adjuster_name: lead.adjuster_name,
        })),
      });
    }

    // 3. Storm leads with no sequence sent
    const { data: stormLeadsNoSequence } = await supabaseAdmin
      .from("contacts")
      .select("id, email, first_name, last_name, zip")
      .eq("workspace_id", workspaceId)
      .limit(10);

    if (stormLeadsNoSequence && stormLeadsNoSequence.length > 0) {
      dangerItems.push({
        type: "storm_leads_no_sequence",
        count: stormLeadsNoSequence.length,
        priority: "medium",
        items: stormLeadsNoSequence.map((lead) => ({
          id: lead.id,
          email: lead.email,
          name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email,
          zip: lead.zip,
        })),
      });
    }

    // 4. Appointments with missing notes
    const { data: appointmentsMissingNotes } = await supabaseAdmin
      .from("schedule_bookings")
      .select("id, homeowner_email, homeowner_name, start_time, post_inspection_notes")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .is("post_inspection_notes", null)
      .limit(10);

    if (appointmentsMissingNotes && appointmentsMissingNotes.length > 0) {
      dangerItems.push({
        type: "appointments_missing_notes",
        count: appointmentsMissingNotes.length,
        priority: "medium",
        items: appointmentsMissingNotes.map((apt) => ({
          id: apt.id,
          email: apt.homeowner_email,
          name: apt.homeowner_name,
          appointment_date: apt.start_time,
        })),
      });
    }

    // 5. High-value leads not replied to
    const { data: highValueLeadsNotReplied } = await supabaseAdmin
      .from("lead_auto_follow_up_stats")
      .select("contact_id, potential_job_value")
      .eq("workspace_id", workspaceId)
      .gt("potential_job_value", 5000)
      .limit(10);

    if (highValueLeadsNotReplied && highValueLeadsNotReplied.length > 0) {
      dangerItems.push({
        type: "high_value_lead_not_replied",
        count: highValueLeadsNotReplied.length,
        priority: "high",
        items: highValueLeadsNotReplied.map((lead) => ({
          contact_id: lead.contact_id,
          potential_value: Number(lead.potential_job_value || 0),
        })),
      });
    }

    // 6. Overdue tasks (if tasks table exists)
    const { data: overdueTasks } = await supabaseAdmin
      .from("tasks")
      .select("id, title, due_date, status")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .lt("due_date", new Date().toISOString())
      .limit(10)
      .catch(() => ({ data: [] }));

    if (overdueTasks && overdueTasks.length > 0) {
      dangerItems.push({
        type: "tasks_overdue",
        count: overdueTasks.length,
        priority: "medium",
        items: overdueTasks.map((task) => ({
          id: task.id,
          title: task.title,
          due_date: task.due_date,
        })),
      });
    }

    const totalDangerItems = dangerItems.reduce((sum, item) => sum + item.count, 0);
    const highPriorityCount = dangerItems.filter((item) => item.priority === "high").length;
    const mediumPriorityCount = dangerItems.filter((item) => item.priority === "medium").length;
    const lowPriorityCount = dangerItems.filter((item) => item.priority === "low").length;

    return NextResponse.json({
      report_date: date,
      generated_at: new Date().toISOString(),
      total_danger_items: totalDangerItems,
      priority_breakdown: {
        high: highPriorityCount,
        medium: mediumPriorityCount,
        low: lowPriorityCount,
      },
      revenue_at_risk: 0, // Would need to calculate from items
      danger_items: dangerItems,
    });
  } catch (error: any) {
    console.error("Danger report error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































