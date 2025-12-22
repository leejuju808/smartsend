// Block 16200 — Task Auto-Generation Functions
// Functions to automatically create tasks from various sources

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TaskType = "follow_up_needed" | "book_inspection" | "answer_question" | "update_lead_info" | "high_urgency_issue";
type UrgencyLevel = "high" | "normal" | "low";

interface CreateTaskParams {
  workspace_id: string;
  contact_id?: string;
  user_id?: string;
  task_type: TaskType;
  urgency?: UrgencyLevel;
  title: string;
  description?: string;
  notes?: string;
  due_at: string;
  metadata?: Record<string, any>;
  auto_generated?: boolean;
  auto_source?: string;
  pipeline_stage_id?: string;
}

/**
 * Create a task with automatic status calculation
 */
export async function createTask(params: CreateTaskParams) {
  // Determine status based on due_at
  const dueDate = new Date(params.due_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDateOnly = new Date(dueDate);
  dueDateOnly.setHours(0, 0, 0, 0);
  
  let status: "today" | "upcoming" | "waiting_on_homeowner" = "upcoming";
  if (dueDateOnly.getTime() === today.getTime()) {
    status = "today";
  }

  const { data, error } = await supabase
    .from("smartsend_tasks")
    .insert({
      workspace_id: params.workspace_id,
      user_id: params.user_id || null,
      contact_id: params.contact_id || null,
      task_type: params.task_type,
      urgency: params.urgency || "normal",
      status,
      title: params.title,
      description: params.description || null,
      notes: params.notes || null,
      due_at: params.due_at,
      metadata: params.metadata || {},
      auto_generated: params.auto_generated ?? false,
      auto_source: params.auto_source || null,
      pipeline_stage_id: params.pipeline_stage_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating task:", error);
    throw error;
  }

  return data;
}

/**
 * Auto-create task from inbox reply
 */
export async function createTaskFromInboxReply(params: {
  workspace_id: string;
  contact_id: string;
  reply_intent: string;
  has_question: boolean;
  has_booking_intent: boolean;
  has_urgent_damage: boolean;
  message_snippet?: string;
  user_id?: string;
}) {
  let task_type: TaskType = "follow_up_needed";
  let urgency: UrgencyLevel = "normal";
  let title = "Follow up with homeowner";
  let due_at = new Date();
  due_at.setDate(due_at.getDate() + 2); // Default: 2 days

  // Determine task type and urgency based on reply intent
  if (params.has_urgent_damage) {
    task_type = "high_urgency_issue";
    urgency = "high";
    title = "Urgent: Address roof damage";
    due_at = new Date(); // Due today
  } else if (params.has_booking_intent) {
    task_type = "book_inspection";
    urgency = "high";
    title = "Book inspection appointment";
    due_at = new Date();
    due_at.setDate(due_at.getDate() + 1); // Due tomorrow
  } else if (params.has_question) {
    task_type = "answer_question";
    urgency = "normal";
    title = "Answer homeowner question";
    due_at = new Date();
    due_at.setDate(due_at.getDate() + 1); // Due tomorrow
  } else if (params.reply_intent === "warm" || params.reply_intent === "hot") {
    task_type = "follow_up_needed";
    urgency = params.reply_intent === "hot" ? "high" : "normal";
    title = "Follow up with warm lead";
    due_at = new Date();
    due_at.setDate(due_at.getDate() + (params.reply_intent === "hot" ? 1 : 2));
  }

  return createTask({
    workspace_id: params.workspace_id,
    contact_id: params.contact_id,
    user_id: params.user_id,
    task_type,
    urgency,
    title,
    description: `Reply intent: ${params.reply_intent}`,
    due_at: due_at.toISOString(),
    metadata: {
      reply_intent: params.reply_intent,
      last_message_snippet: params.message_snippet,
      has_question: params.has_question,
      has_booking_intent: params.has_booking_intent,
      has_urgent_damage: params.has_urgent_damage,
    },
    auto_generated: true,
    auto_source: "inbox",
  });
}

/**
 * Auto-create task from scheduler (missed appointment)
 */
export async function createTaskFromScheduler(params: {
  workspace_id: string;
  contact_id: string;
  appointment_date: string;
  missed: boolean;
  user_id?: string;
}) {
  if (params.missed) {
    return createTask({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      user_id: params.user_id,
      task_type: "book_inspection",
      urgency: "high",
      title: "Follow up on missed appointment",
      description: `Appointment was scheduled for ${new Date(params.appointment_date).toLocaleString()}`,
      due_at: new Date().toISOString(), // Due immediately
      metadata: {
        appointment_date: params.appointment_date,
        missed: true,
      },
      auto_generated: true,
      auto_source: "scheduler",
    });
  } else {
    // Create follow-up reminder for upcoming appointment
    const appointmentDate = new Date(params.appointment_date);
    const reminderDate = new Date(appointmentDate);
    reminderDate.setDate(reminderDate.getDate() - 1); // 1 day before

    return createTask({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      user_id: params.user_id,
      task_type: "book_inspection",
      urgency: "normal",
      title: "Confirm tomorrow's inspection",
      description: `Appointment scheduled for ${appointmentDate.toLocaleString()}`,
      due_at: reminderDate.toISOString(),
      metadata: {
        appointment_date: params.appointment_date,
        reminder: true,
      },
      auto_generated: true,
      auto_source: "scheduler",
    });
  }
}

/**
 * Auto-create task from pipeline movement
 */
export async function createTaskFromPipeline(params: {
  workspace_id: string;
  contact_id: string;
  pipeline_stage_id: string;
  stage_key: string;
  user_id?: string;
}) {
  // Create tasks when lead moves to HOT stage
  if (params.stage_key === "hot") {
    return createTask({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      user_id: params.user_id,
      task_type: "book_inspection",
      urgency: "high",
      title: "Schedule inspection for hot lead",
      description: "Lead moved to HOT stage - prioritize booking",
      due_at: new Date().toISOString(), // Due today
      metadata: {
        pipeline_stage: params.stage_key,
      },
      pipeline_stage_id: params.pipeline_stage_id,
      auto_generated: true,
      auto_source: "pipeline",
    });
  }

  // Create follow-up task if lead stuck in stage for 7+ days
  // This would be checked by a separate worker
  return null;
}

/**
 * Auto-create task from weather engine (storm opportunity)
 */
export async function createTaskFromWeather(params: {
  workspace_id: string;
  contact_id: string;
  storm_risk: number;
  neighborhood: string;
  user_id?: string;
}) {
  if (params.storm_risk > 0.7) {
    return createTask({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      user_id: params.user_id,
      task_type: "high_urgency_issue",
      urgency: "high",
      title: `Storm opportunity in ${params.neighborhood}`,
      description: `High storm risk detected - reach out immediately`,
      due_at: new Date().toISOString(), // Due immediately
      metadata: {
        storm_risk: params.storm_risk,
        neighborhood: params.neighborhood,
        weather_triggered: true,
      },
      auto_generated: true,
      auto_source: "weather",
    });
  }

  return null;
}

/**
 * Auto-create task from list intelligence (old quote revival)
 */
export async function createTaskFromListIntelligence(params: {
  workspace_id: string;
  contact_id: string;
  list_type: "old_quote" | "neighborhood";
  user_id?: string;
}) {
  if (params.list_type === "old_quote") {
    return createTask({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      user_id: params.user_id,
      task_type: "follow_up_needed",
      urgency: "normal",
      title: "Revive old quote",
      description: "Follow up on previous quote",
      due_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days
      metadata: {
        list_type: params.list_type,
      },
      auto_generated: true,
      auto_source: "list_intelligence",
    });
  }

  return null;
}





















































