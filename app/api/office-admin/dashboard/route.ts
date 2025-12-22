// Block 257000 — AI Office Admin Engine v1
// GET /api/office-admin/dashboard
// Office Activity Dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = req.nextUrl.searchParams;
    const company_id = searchParams.get("company_id");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!company_id) {
      return NextResponse.json(
        { error: "Missing required parameter: company_id" },
        { status: 400 }
      );
    }

    // Get dashboard summary using the database function
    const { data: summary, error: summaryError } = await supabase
      .rpc("get_office_dashboard_summary", {
        p_company_id: company_id,
        p_date: date,
      });

    if (summaryError) {
      console.error("Error getting dashboard summary:", summaryError);
      // Fallback to manual query
      const today = new Date(date);
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      // Get messages received today
      const { count: messagesReceived } = await supabase
        .from("office_inbox")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay);

      // Get messages handled automatically
      const { count: messagesHandledAuto } = await supabase
        .from("office_inbox")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .is("assigned_to", null)
        .in("status", ["closed", "archived"]);

      // Get messages assigned to staff
      const { count: messagesAssigned } = await supabase
        .from("office_inbox")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .not("assigned_to", "is", null);

      // Get average response time
      const { data: responseTimes } = await supabase
        .from("office_inbox")
        .select("created_at, response_sent_at")
        .eq("company_id", company_id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .eq("response_sent", true)
        .not("response_sent_at", "is", null);

      let avgResponseTime = 0;
      if (responseTimes && responseTimes.length > 0) {
        const times = responseTimes
          .map((r) => {
            if (r.response_sent_at && r.created_at) {
              return (new Date(r.response_sent_at).getTime() - new Date(r.created_at).getTime()) / (1000 * 60);
            }
            return null;
          })
          .filter((t): t is number => t !== null);
        
        if (times.length > 0) {
          avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
      }

      // Get overdue tasks
      const { count: overdueTasks } = await supabase
        .from("office_tasks")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .in("status", ["open", "in_progress"])
        .lt("due_date", date);

      // Get open tasks
      const { count: openTasks } = await supabase
        .from("office_tasks")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .in("status", ["open", "in_progress"]);

      // Get completed tasks today
      const { count: completedTasks } = await supabase
        .from("office_tasks")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .eq("status", "completed");

      // Get documents filed today
      const { count: documentsFiled } = await supabase
        .from("office_documents")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay);

      // Get voicemails transcribed today
      const { count: voicemailsTranscribed } = await supabase
        .from("office_inbox")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .eq("source", "voicemail")
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .not("transcription", "is", null);

      return NextResponse.json({
        date,
        messages_received: messagesReceived || 0,
        messages_handled_automatically: messagesHandledAuto || 0,
        messages_assigned_to_staff: messagesAssigned || 0,
        avg_response_time_minutes: Math.round(avgResponseTime * 100) / 100,
        overdue_tasks: overdueTasks || 0,
        open_tasks: openTasks || 0,
        completed_tasks: completedTasks || 0,
        documents_filed: documentsFiled || 0,
        voicemails_transcribed: voicemailsTranscribed || 0,
      });
    }

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("Error getting dashboard data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get dashboard data" },
      { status: 500 }
    );
  }
}





















