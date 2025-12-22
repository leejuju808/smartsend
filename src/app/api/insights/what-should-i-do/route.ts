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
 * POST /api/insights/what-should-i-do
 * AI-generated daily priority plan - "What Should I Do Today?"
 */
export async function POST(req: NextRequest) {
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

    // Get danger report data
    const dangerReportRes = await fetch(
      `${req.nextUrl.origin}/api/insights/danger-report?date=${new Date().toISOString().split("T")[0]}`,
      {
        headers: {
          Cookie: req.headers.get("cookie") || "",
        },
      }
    );
    const dangerReport = await dangerReportRes.json();

    // Get lead intelligence data
    const { data: leadInsights } = await supabaseAdmin
      .from("insights_leads")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    // Get revenue opportunities
    const revenueRes = await fetch(`${req.nextUrl.origin}/api/insights/revenue`, {
      headers: {
        Cookie: req.headers.get("cookie") || "",
      },
    });
    const revenueData = await revenueRes.json();

    // Build priority plan based on data
    const priorityPlan: any[] = [];

    // 1. Contact hot leads first (from danger report)
    const hotLeadsNotContacted = dangerReport.danger_items?.find(
      (item: any) => item.type === "hot_lead_not_contacted"
    );
    if (hotLeadsNotContacted && hotLeadsNotContacted.items?.length > 0) {
      priorityPlan.push({
        action: "contact_hot_leads",
        priority: "high",
        count: Math.min(3, hotLeadsNotContacted.items.length),
        items: hotLeadsNotContacted.items.slice(0, 3),
        reason: "Hot leads not contacted in 24 hours - highest conversion potential",
      });
    }

    // 2. Send storm sequences
    const stormLeadsNoSequence = dangerReport.danger_items?.find(
      (item: any) => item.type === "storm_leads_no_sequence"
    );
    if (stormLeadsNoSequence && stormLeadsNoSequence.items?.length > 0) {
      priorityPlan.push({
        action: "send_storm_sequence",
        priority: "high",
        count: Math.min(5, stormLeadsNoSequence.items.length),
        items: stormLeadsNoSequence.items.slice(0, 5),
        reason: "Storm-affected leads need immediate outreach",
      });
    }

    // 3. Call insurance leads
    const insuranceLeadsNeedingPrep = dangerReport.danger_items?.find(
      (item: any) => item.type === "insurance_lead_needs_adjuster_prep"
    );
    if (insuranceLeadsNeedingPrep && insuranceLeadsNeedingPrep.items?.length > 0) {
      priorityPlan.push({
        action: "call_insurance_lead",
        priority: "high",
        count: 1,
        items: insuranceLeadsNeedingPrep.items.slice(0, 1),
        reason: "Insurance lead has adjuster scheduled - prep needed",
      });
    }

    // 4. Book appointments
    const unbookedAppointments = revenueData.breakdown?.unbooked_appointments?.items || [];
    if (unbookedAppointments.length > 0) {
      priorityPlan.push({
        action: "book_appointments",
        priority: "medium",
        count: Math.min(2, unbookedAppointments.length),
        items: unbookedAppointments.slice(0, 2),
        reason: "Hot leads ready to book appointments",
      });
    }

    // 5. Finish tasks
    const overdueTasks = dangerReport.danger_items?.find(
      (item: any) => item.type === "tasks_overdue"
    );
    if (overdueTasks && overdueTasks.items?.length > 0) {
      priorityPlan.push({
        action: "finish_tasks",
        priority: "medium",
        count: Math.min(5, overdueTasks.items.length),
        items: overdueTasks.items.slice(0, 5),
        reason: "Overdue tasks need completion",
      });
    }

    // 6. Check open inbox threads
    const { data: replyMetrics } = await supabaseAdmin
      .from("insights_reply_metrics")
      .select("unread_messages_count, messages_needing_follow_up")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (replyMetrics && (replyMetrics.unread_messages_count > 0 || replyMetrics.messages_needing_follow_up > 0)) {
      priorityPlan.push({
        action: "check_inbox_threads",
        priority: "medium",
        count: replyMetrics.unread_messages_count + replyMetrics.messages_needing_follow_up,
        items: [],
        reason: `${replyMetrics.unread_messages_count} unread messages and ${replyMetrics.messages_needing_follow_up} needing follow-up`,
      });
    }

    // 7. Add appointment notes
    const appointmentsMissingNotes = dangerReport.danger_items?.find(
      (item: any) => item.type === "appointments_missing_notes"
    );
    if (appointmentsMissingNotes && appointmentsMissingNotes.items?.length > 0) {
      priorityPlan.push({
        action: "add_appointment_notes",
        priority: "low",
        count: Math.min(3, appointmentsMissingNotes.items.length),
        items: appointmentsMissingNotes.items.slice(0, 3),
        reason: "Completed appointments need notes for follow-up",
      });
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      total_actions: priorityPlan.length,
      priority_plan: priorityPlan,
      summary: {
        high_priority: priorityPlan.filter((p) => p.priority === "high").length,
        medium_priority: priorityPlan.filter((p) => p.priority === "medium").length,
        low_priority: priorityPlan.filter((p) => p.priority === "low").length,
      },
    });
  } catch (error: any) {
    console.error("What should I do error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































