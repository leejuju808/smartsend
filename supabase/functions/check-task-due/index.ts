// supabase/functions/check-task-due/index.ts
// Scheduled function to check for tasks that are due and create notifications
// Run via pg_cron or external scheduler (e.g., Vercel Cron)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    // Find tasks that are due (due_at <= now()) and haven't had a notification sent
    const now = new Date().toISOString();
    
    const { data: dueTasks, error: tasksError } = await supabase
      .from("tasks")
      .select(`
        id,
        workspace_id,
        user_id,
        lead_id,
        campaign_id,
        title,
        due_at,
        reminder_sent
      `)
      .lte("due_at", now)
      .eq("reminder_sent", false)
      .is("due_at", null, { negate: true })
      .limit(100); // Process in batches

    if (tasksError) {
      console.error("Error fetching due tasks:", tasksError);
      return new Response(
        JSON.stringify({ ok: false, error: tasksError.message }),
        { status: 500 }
      );
    }

    if (!dueTasks || dueTasks.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { status: 200 }
      );
    }

    let processed = 0;
    let errors = 0;

    // Process each task
    for (const task of dueTasks) {
      try {
        // Get org_id from workspace_id or campaign_id
        let orgId: string | null = null;
        
        if (task.workspace_id) {
          // Try to get org_id from workspace
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("org_id")
            .eq("id", task.workspace_id)
            .maybeSingle();
          
          orgId = workspace?.org_id || null;
        }

        if (!orgId && task.campaign_id) {
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("org_id")
            .eq("id", task.campaign_id)
            .maybeSingle();
          
          orgId = campaign?.org_id || null;
        }

        if (!orgId || !task.user_id) {
          console.warn(`Skipping task ${task.id}: missing org_id or user_id`);
          continue;
        }

        // Create notification using the helper function
        const { data: notificationId, error: notifyError } = await supabase.rpc(
          "create_task_due_notification",
          {
            p_org_id: orgId,
            p_user_id: task.user_id,
            p_task_id: task.id,
            p_contact_id: task.lead_id || null,
            p_campaign_id: task.campaign_id || null,
          }
        );

        if (notifyError) {
          console.error(`Failed to create notification for task ${task.id}:`, notifyError);
          errors++;
          continue;
        }

        // Mark reminder as sent
        const { error: updateError } = await supabase
          .from("tasks")
          .update({ reminder_sent: true })
          .eq("id", task.id);

        if (updateError) {
          console.error(`Failed to update reminder_sent for task ${task.id}:`, updateError);
          errors++;
          continue;
        }

        processed++;
      } catch (error) {
        console.error(`Error processing task ${task.id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        total: dueTasks.length,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500 }
    );
  }
});





























































