// Block 257000 — AI Office Admin Engine v1
// POST /api/office-admin/follow-up
// Follow-Up Automation - checks for items needing follow-up

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { company_id, check_tasks = true, check_inbox = true } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "Missing required field: company_id" },
        { status: 400 }
      );
    }

    const followUps: any[] = [];

    // Check inbox items that need follow-up (no response in 3+ days)
    if (check_inbox) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: inboxItems } = await supabase
        .from("office_inbox")
        .select("*")
        .eq("company_id", company_id)
        .in("status", ["new", "open", "in_progress"])
        .eq("response_sent", false)
        .lte("created_at", threeDaysAgo.toISOString());

      if (inboxItems) {
        for (const item of inboxItems) {
          followUps.push({
            type: "inbox_no_response",
            inbox_id: item.id,
            lead_id: item.lead_id,
            job_id: item.job_id,
            assigned_to: item.assigned_to,
            message: `Customer message from ${item.from_name || item.from_email || "customer"} has no response after 3 days`,
            priority: item.priority || "normal",
            created_at: item.created_at,
          });
        }
      }
    }

    // Check tasks that are overdue or due soon
    if (check_tasks) {
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      const { data: overdueTasks } = await supabase
        .from("office_tasks")
        .select("*")
        .eq("company_id", company_id)
        .in("status", ["open", "in_progress"])
        .lt("due_date", today);

      const { data: dueSoonTasks } = await supabase
        .from("office_tasks")
        .select("*")
        .eq("company_id", company_id)
        .in("status", ["open", "in_progress"])
        .eq("due_date", tomorrowStr);

      if (overdueTasks) {
        for (const task of overdueTasks) {
          followUps.push({
            type: "task_overdue",
            task_id: task.id,
            inbox_id: task.inbox_id,
            lead_id: task.lead_id,
            job_id: task.job_id,
            assigned_to: task.assigned_to,
            message: `Task "${task.task}" is overdue (due ${task.due_date})`,
            priority: task.priority || "high",
            created_at: task.created_at,
          });
        }
      }

      if (dueSoonTasks) {
        for (const task of dueSoonTasks) {
          followUps.push({
            type: "task_due_soon",
            task_id: task.id,
            inbox_id: task.inbox_id,
            lead_id: task.lead_id,
            job_id: task.job_id,
            assigned_to: task.assigned_to,
            message: `Task "${task.task}" is due tomorrow`,
            priority: task.priority || "normal",
            created_at: task.created_at,
          });
        }
      }
    }

    // Check for customers awaiting responses (leads with no activity)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: staleLeads } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone, status")
      .eq("company_id", company_id)
      .in("status", ["new", "contacted"])
      .lte("created_at", sevenDaysAgo.toISOString())
      .limit(10);

    if (staleLeads) {
      for (const lead of staleLeads) {
        // Check if there's an active inbox item or task
        const { data: activeItems } = await supabase
          .from("office_inbox")
          .select("id")
          .eq("lead_id", lead.id)
          .in("status", ["new", "open", "in_progress"])
          .limit(1);

        const { data: activeTasks } = await supabase
          .from("office_tasks")
          .select("id")
          .eq("lead_id", lead.id)
          .in("status", ["open", "in_progress"])
          .limit(1);

        if (!activeItems?.length && !activeTasks?.length) {
          followUps.push({
            type: "lead_no_followup",
            lead_id: lead.id,
            message: `Lead ${lead.first_name} ${lead.last_name} (${lead.email || lead.phone}) has no activity in 7 days`,
            priority: "normal",
            created_at: lead.created_at,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      follow_ups: followUps,
      count: followUps.length,
      summary: {
        inbox_no_response: followUps.filter((f) => f.type === "inbox_no_response").length,
        task_overdue: followUps.filter((f) => f.type === "task_overdue").length,
        task_due_soon: followUps.filter((f) => f.type === "task_due_soon").length,
        lead_no_followup: followUps.filter((f) => f.type === "lead_no_followup").length,
      },
    });
  } catch (error: any) {
    console.error("Error checking follow-ups:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check follow-ups" },
      { status: 500 }
    );
  }
}





















