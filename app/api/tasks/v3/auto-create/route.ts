// Block 18100 — SmartSend Task System v3
// Auto-create tasks for all 8 categories

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { TaskTypeV3, TaskPriorityLevel } from "../route";

export type AutoCreateTaskInput = {
  category: 'lead_followup' | 'appointment' | 'insurance' | 'storm' | 'pipeline' | 'quote' | 'admin';
  contactId?: string;
  leadId?: string;
  trigger: string; // Specific trigger event
  metadata?: Record<string, any>;
  userId?: string;
};

/**
 * POST /api/tasks/v3/auto-create
 * Auto-create tasks based on events
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = (await req.json()) as AutoCreateTaskInput;
    const { category, contactId, leadId, trigger, metadata = {}, userId } = body;

    // Determine task type and details based on category and trigger
    let taskType: TaskTypeV3;
    let title: string;
    let priority: TaskPriorityLevel = 'medium';
    let dueAt: Date = new Date();

    switch (category) {
      case 'lead_followup':
        switch (trigger) {
          case 'homeowner_replied':
            taskType = 'lead_reply_needed';
            title = `Reply needed from ${contactId ? 'contact' : 'homeowner'}`;
            priority = 'high';
            dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
            break;
          case 'question_asked':
            taskType = 'lead_question_asked';
            title = `Answer homeowner's question`;
            priority = 'high';
            dueAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
            break;
          case 'no_reply':
            taskType = 'lead_no_reply';
            title = `Follow up - no reply in ${metadata.days || 2} days`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
            break;
          case 'booking_intent':
            taskType = 'lead_booking_intent';
            title = `Offer booking times`;
            priority = 'high';
            dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
            break;
          default:
            taskType = 'lead_follow_up';
            title = `Follow up with ${contactId ? 'contact' : 'homeowner'}`;
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        }
        break;

      case 'appointment':
        switch (trigger) {
          case 'appointment_booked':
            taskType = 'appointment_booked';
            title = `Prep for appointment`;
            priority = 'high';
            dueAt = new Date(metadata.appointmentAt || Date.now());
            break;
          case 'appointment_reminder':
            taskType = 'appointment_reminder';
            title = `Send appointment reminder`;
            priority = 'high';
            dueAt = new Date((metadata.appointmentAt || Date.now()) - 60 * 60 * 1000); // 1 hour before
            break;
          case 'appointment_missed':
            taskType = 'appointment_missed';
            title = `Reschedule missed appointment`;
            priority = 'critical';
            dueAt = new Date();
            break;
          default:
            taskType = 'appointment_confirmation';
            title = `Confirm appointment`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
        break;

      case 'insurance':
        switch (trigger) {
          case 'claim_filed':
            taskType = 'insurance_claim_filed';
            title = `Prepare adjuster notes`;
            priority = 'critical';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          case 'adjuster_scheduled':
            taskType = 'insurance_adjuster_scheduled';
            title = `Prep for adjuster meeting`;
            priority = 'critical';
            dueAt = new Date(metadata.adjusterDate || Date.now());
            break;
          case 'scope_received':
            taskType = 'insurance_scope_received';
            title = `Review insurance scope`;
            priority = 'high';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          case 'supplement_needed':
            taskType = 'insurance_supplement_needed';
            title = `Request supplement`;
            priority = 'high';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          default:
            taskType = 'insurance_claim_filed';
            title = `Insurance follow-up`;
            priority = 'high';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
        break;

      case 'storm':
        switch (trigger) {
          case 'hail_event':
            taskType = 'storm_hail_event';
            title = `Send storm inspection message - Hail`;
            priority = 'critical';
            dueAt = new Date();
            break;
          case 'wind_event':
            taskType = 'storm_wind_event';
            title = `Send storm inspection message - Wind`;
            priority = 'critical';
            dueAt = new Date();
            break;
          case 'leak_detected':
            taskType = 'storm_leak_detected';
            title = `URGENT: Leak detected - immediate follow-up`;
            priority = 'critical';
            dueAt = new Date();
            break;
          default:
            taskType = 'storm_zip_affected';
            title = `Follow storm script for ${metadata.zip || 'affected area'}`;
            priority = 'high';
            dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        }
        break;

      case 'pipeline':
        switch (trigger) {
          case 'moved_to_warm':
            taskType = 'pipeline_warm_followup';
            title = `Follow up with warm lead`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          case 'moved_to_hot':
            taskType = 'pipeline_hot_booking';
            title = `HOT lead - offer appointment times`;
            priority = 'high';
            dueAt = new Date();
            break;
          case 'moved_to_quote':
            taskType = 'pipeline_quote_checkin';
            title = `Check in on quote`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            break;
          case 'moved_to_insurance':
            taskType = 'pipeline_insurance_timeline';
            title = `Manage insurance timeline`;
            priority = 'high';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          default:
            taskType = 'pipeline_warm_followup';
            title = `Pipeline follow-up`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
        break;

      case 'quote':
        switch (trigger) {
          case 'quote_sent':
            taskType = 'quote_sent';
            title = `Follow up on quote`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            break;
          case 'quote_stale':
            taskType = 'quote_stale';
            title = `Reconnect on stale quote`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          case 'quote_viewed':
            taskType = 'quote_viewed';
            title = `Quote viewed - follow up now`;
            priority = 'high';
            dueAt = new Date();
            break;
          default:
            taskType = 'quote_sent';
            title = `Quote follow-up`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        }
        break;

      case 'admin':
        switch (trigger) {
          case 'domain_issue':
            taskType = 'admin_domain_issue';
            title = `Fix domain issue`;
            priority = 'high';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          case 'billing_issue':
            taskType = 'admin_billing_issue';
            title = `Resolve billing issue`;
            priority = 'high';
            dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          default:
            taskType = 'admin_upload_missing_info';
            title = `Admin task: ${trigger}`;
            priority = 'medium';
            dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
        break;

      default:
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Create task
    const { data: task, error } = await supabase
      .from("tasks_v3")
      .insert({
        workspace_id: workspaceId,
        user_id: userId || user.id,
        contact_id: contactId || null,
        lead_id: leadId || null,
        task_type: taskType,
        priority: priority,
        status: 'open',
        title: title,
        description: metadata.description || null,
        due_at: dueAt.toISOString(),
        auto_generated: true,
        auto_source: category,
        metadata: {
          ...metadata,
          trigger: trigger,
          auto_created_at: new Date().toISOString()
        },
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate priority score
    await supabase.rpc('calculate_task_priority_score', {
      p_task_id: task.id
    });

    return NextResponse.json({ 
      success: true, 
      data: {
        id: task.id,
        taskType: task.task_type,
        title: task.title,
        priority: task.priority,
        dueAt: task.due_at
      }
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































