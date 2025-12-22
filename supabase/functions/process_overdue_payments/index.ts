// Block 27340 — SmartSend Roofing Collections & Overdue Chase Brain v1
// Edge Function: Process Overdue Payments
// Run this daily (CRON in Supabase functions)
// Auto-marks overdue payment requests and queues reminders

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get overdue payments from view
    const { data: overdue, error: overdueError } = await supabase
      .from("roofing_overdue_payments")
      .select("*");

    if (overdueError) {
      console.error("Error fetching overdue payments:", overdueError);
      return new Response(
        JSON.stringify({ error: overdueError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!overdue || overdue.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No overdue payments",
          processed: 0 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const nowIso = new Date().toISOString();
    let markedOverdue = 0;
    let remindersQueued = 0;
    let callTasksCreated = 0;
    const errors: string[] = [];

    // 2. Process each overdue payment
    for (const p of overdue) {
      try {
        // Mark as overdue in base table
        const { error: updateError } = await supabase
          .from("roofing_payment_requests")
          .update({ status: "overdue" })
          .eq("id", p.payment_request_id);

        if (updateError) {
          errors.push(`Failed to mark overdue for ${p.payment_request_id}: ${updateError.message}`);
          continue;
        }

        if (p.status !== "overdue") {
          markedOverdue++;
        }

        // 3. Check if we already created any action in last 3 days
        const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
        const { data: existingActions } = await supabase
          .from("roofing_collection_actions")
          .select("*")
          .eq("payment_request_id", p.payment_request_id)
          .gte("run_at", threeDaysAgo);

        if (existingActions && existingActions.length > 0) {
          continue; // don't spam
        }

        // 4. Decide action based on severity
        let actionType = "email_reminder";
        let channel = "email";

        if (p.days_overdue >= 30) {
          actionType = "call_task";
          channel = "phone";
        } else if (p.days_overdue >= 14) {
          actionType = "email_reminder";
          channel = "email";
        }

        // 5. Insert collections action
        const { error: actionError } = await supabase
          .from("roofing_collection_actions")
          .insert({
            payment_request_id: p.payment_request_id,
            job_id: p.job_id,
            action_type: actionType,
            channel,
            run_at: nowIso,
            status: actionType === "call_task" ? "queued" : "queued",
          });

        if (actionError) {
          errors.push(`Failed to create action for ${p.payment_request_id}: ${actionError.message}`);
          continue;
        }

        // 6. If email reminder, also drop into send_queue
        if (actionType === "email_reminder" && p.customer_email) {
          const subject = `Friendly reminder: payment for ${p.job_name}`;
          const body = `Hi ${p.customer_name || "there"},

This is a friendly reminder about the outstanding payment of $${Number(p.amount).toFixed(2)} for your roofing project at ${p.job_name}.

If you've already taken care of this, thank you — you can ignore this message.
Otherwise, please use your payment link or contact our office and we'll be happy to help.

Thank you,
Your Roofing Company`;

          // Get workspace_id from job
          const { data: job } = await supabase
            .from("roofing_jobs")
            .select("workspace_id")
            .eq("id", p.job_id)
            .single();

          if (job?.workspace_id) {
            // Get owner_id from workspace
            const { data: workspaceData } = await supabase
              .from("workspaces")
              .select("owner_id")
              .eq("id", job.workspace_id)
              .single();

            // Try to insert into send_queue (adapt based on your schema)
            const { error: queueError } = await supabase
              .from("send_queue")
              .insert({
                user_id: workspaceData?.owner_id || null,
                message_body: body,
                subject: subject,
                send_at: nowIso,
                status: "queued",
                step_label: "collections_reminder",
                // Note: You may need to add campaign_id, contact_id based on your schema
              });

            if (queueError) {
              console.warn(`Could not enqueue email for payment ${p.payment_request_id}:`, queueError.message);
              // Still count as queued since we created the action
            } else {
              remindersQueued++;
            }
          }
        }

        // 7. If call task, create a task record
        if (actionType === "call_task") {
          // Get workspace_id from job
          const { data: jobForTask } = await supabase
            .from("roofing_jobs")
            .select("workspace_id")
            .eq("id", p.job_id)
            .single();

          const { error: taskError } = await supabase
            .from("tasks")
            .insert({
              workspace_id: jobForTask?.workspace_id || null,
              title: `Call ${p.customer_name || p.customer_email} about overdue payment`,
              description: `Payment request ${p.request_type}: $${Number(p.amount).toFixed(2)} overdue by ${p.days_overdue} days for ${p.job_name}`,
              status: "todo",
              type: "collections_call",
              priority: "high",
              due_date: new Date().toISOString().split("T")[0],
              metadata: {
                payment_request_id: p.payment_request_id,
                job_id: p.job_id,
                amount: p.amount,
                days_overdue: p.days_overdue,
              },
            });

          if (taskError) {
            console.warn(`Could not create call task for payment ${p.payment_request_id}:`, taskError.message);
          } else {
            callTasksCreated++;
          }
        }
      } catch (e: any) {
        errors.push(`Error processing payment ${p.payment_request_id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: overdue.length,
        marked_overdue: markedOverdue,
        reminders_queued: remindersQueued,
        call_tasks_created: callTasksCreated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Process overdue payments error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































