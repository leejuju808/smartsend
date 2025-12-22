import { serve } from "https://deno.land/x/sift/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Load all active no_reply automations
    const { data: rules, error: rulesError } = await supabase
      .from("automations")
      .select("*")
      .eq("trigger", "no_reply")
      .eq("enabled", true);

    if (rulesError) {
      console.error("Error fetching no_reply automations:", rulesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch automations" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No no_reply automations found" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let totalProcessed = 0;

    for (const rule of rules) {
      const delayMs = (rule.delay_hours || 0) * 3600 * 1000;
      const cutoff = new Date(Date.now() - delayMs).toISOString();

      // 2. Find threads with no replies since initial send
      // We check threads where first_sent_at is before the cutoff
      // and last_incoming_message_at is null (no incoming replies)
      // Join with campaigns to filter by workspace_id
      const { data: threads, error: threadsError } = await supabase
        .from("reply_threads")
        .select(
          `
          id,
          lead_id,
          campaign_id,
          first_sent_at,
          last_incoming_message_at,
          campaigns!inner(workspace_id)
        `
        )
        .lte("first_sent_at", cutoff)
        .is("last_incoming_message_at", null)
        .not("first_sent_at", "is", null);

      if (threadsError) {
        console.error(`Error fetching threads for rule ${rule.id}:`, threadsError);
        continue;
      }

      if (!threads || threads.length === 0) {
        continue;
      }

      // Filter threads by workspace_id from the joined campaigns
      const matchingThreads = threads.filter(
        (thread: any) =>
          thread.campaigns && thread.campaigns.workspace_id === rule.workspace_id
      );

      if (matchingThreads.length === 0) {
        continue;
      }

      for (const thread of matchingThreads) {
        try {
          await executeActions(supabase, rule.actions || [], thread);
          totalProcessed++;
        } catch (error) {
          console.error(
            `Error executing actions for thread ${thread.id}:`,
            error
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rules_processed: rules.length,
        threads_processed: totalProcessed,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in automation-timer:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function executeActions(
  supabase: any,
  actions: any[],
  thread: any
) {
  for (const action of actions) {
    try {
      // Tag
      if (action.type === "tag") {
        const { error } = await supabase.from("lead_tag_links").insert({
          lead_id: thread.lead_id,
          tag_id: action.tag_id,
        });
        if (error && error.code !== "23505") {
          // Ignore duplicate tag errors
          console.error("Error adding tag:", error);
        }
      }

      // Untag
      if (action.type === "untag") {
        await supabase
          .from("lead_tag_links")
          .delete()
          .eq("lead_id", thread.lead_id)
          .eq("tag_id", action.tag_id);
      }

      // Stop campaign
      if (action.type === "stop_campaign") {
        await supabase
          .from("reply_threads")
          .update({ status: "closed" })
          .eq("id", thread.id);
      }

      // Send follow-up step
      if (action.type === "send_follow_up") {
        // Insert into send_queue
        // Note: send_queue structure varies, using common fields
        const { error: queueError } = await supabase.from("send_queue").insert({
          lead_id: thread.lead_id,
          campaign_id: thread.campaign_id,
          step_no: action.step || 2,
          status: "queued",
          scheduled_at: new Date().toISOString(),
        });

        if (queueError) {
          console.error("Error queueing follow-up:", queueError);
        }
      }

      // Move stage (CRM pipeline)
      if (action.type === "move_stage") {
        await supabase
          .from("leads")
          .update({ stage: action.stage })
          .eq("id", thread.lead_id);
      }

      // Assign to user
      if (action.type === "assign_to") {
        await supabase
          .from("reply_threads")
          .update({ owner_id: action.user_id })
          .eq("id", thread.id);
      }
    } catch (error) {
      console.error(`Error executing action ${action.type}:`, error);
      // Continue with other actions even if one fails
    }
  }
}

