// Block 257000 — AI Office Admin Engine v1
// POST /api/office-admin/tasks/create
// Smart Task Creation from any customer message

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
    const {
      company_id,
      message, // Customer message
      inbox_id, // Optional: if creating from inbox item
      lead_id,
      job_id,
      manual_task, // Optional: if manually creating, skip AI
    } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "Missing required field: company_id" },
        { status: 400 }
      );
    }

    let taskText = "";
    let taskType = "general";
    let priority = "normal";
    let dueDate: string | null = null;

    // If manual task, use provided data
    if (manual_task) {
      taskText = body.task || "";
      taskType = body.task_type || "general";
      priority = body.priority || "normal";
      dueDate = body.due_date || null;
    } else if (message) {
      // AI Task Creation from message
      const taskPrompt = `You are SmartSend's AI Task Creation Assistant for a roofing company.

Analyze this customer message and determine if a task should be created. If yes, extract:
1. Task description: clear, actionable task (e.g., "Schedule inspection for customer", "Resend contract to customer", "Follow up on estimate")
2. Task type: one of ('follow_up', 'scheduling', 'admin', 'pm_task', 'sales_followup', 'customer_service', 'general')
3. Priority: one of ('low', 'normal', 'high', 'urgent')
4. Due date suggestion: number of days from now (1-7), or null if not urgent

Customer Message:
${message}

Return ONLY valid JSON:
{
  "should_create_task": true/false,
  "task": "task description or null",
  "task_type": "",
  "priority": "",
  "due_days": null or number
}`;

      const taskCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful AI assistant that creates tasks for roofing companies." },
          { role: "user", content: taskPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const taskText_result = taskCompletion.choices[0]?.message?.content || "{}";
      const taskAnalysis = JSON.parse(taskText_result);

      if (!taskAnalysis.should_create_task || !taskAnalysis.task) {
        return NextResponse.json({
          success: false,
          message: "No task needed for this message",
        });
      }

      taskText = taskAnalysis.task;
      taskType = taskAnalysis.task_type || "general";
      priority = taskAnalysis.priority || "normal";

      if (taskAnalysis.due_days) {
        const due = new Date();
        due.setDate(due.getDate() + taskAnalysis.due_days);
        dueDate = due.toISOString().split("T")[0];
      }
    } else {
      return NextResponse.json(
        { error: "Missing required field: message or manual_task" },
        { status: 400 }
      );
    }

    // Determine assignment
    let assignedTo: string | null = body.assigned_to || null;

    if (!assignedTo && taskType) {
      // Auto-assign based on task type
      const roleMap: Record<string, string[]> = {
        pm_task: ["office_manager", "office_staff"],
        sales_followup: ["office_staff", "admin"],
        scheduling: ["office_staff", "admin"],
        admin: ["admin", "office_manager"],
        follow_up: ["office_staff"],
        customer_service: ["office_staff", "admin"],
        general: ["office_staff"],
      };

      const roles = roleMap[taskType] || ["office_staff"];

      const { data: officeUser } = await supabase
        .from("office_users")
        .select("id")
        .eq("company_id", company_id)
        .eq("is_active", true)
        .in("role", roles)
        .limit(1)
        .maybeSingle();

      if (officeUser) {
        assignedTo = officeUser.id;
      }
    }

    // Create task
    const { data: task, error: taskError } = await supabase
      .from("office_tasks")
      .insert({
        company_id,
        inbox_id: inbox_id || null,
        task: taskText,
        description: body.description || null,
        task_type: taskType,
        assigned_to: assignedTo,
        assigned_at: assignedTo ? new Date().toISOString() : null,
        assigned_by: body.assigned_by || null,
        due_date: dueDate,
        priority,
        status: "open",
        lead_id: lead_id || null,
        job_id: job_id || null,
      })
      .select()
      .single();

    if (taskError || !task) {
      console.error("Error creating task:", taskError);
      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      task_id: task.id,
      task: task.task,
      task_type: task.task_type,
      priority: task.priority,
      assigned_to: task.assigned_to,
      due_date: task.due_date,
    });
  } catch (error: any) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create task" },
      { status: 500 }
    );
  }
}





















