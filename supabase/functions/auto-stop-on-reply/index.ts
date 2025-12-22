// supabase/functions/auto-stop-on-reply/index.ts
// Auto-stops campaign leads when replies are detected
// Triggered via scheduled check or realtime subscription

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  try {
    // Find all unprocessed replies
    const { data: replies, error: repliesError } = await supabase
      .from("email_logs")
      .select("id, lead_id, campaign_id")
      .eq("reply_detected", true)
      .eq("processed", false);

    if (repliesError) {
      console.error("Error fetching replies:", repliesError);
      return new Response(
        JSON.stringify({ error: repliesError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!replies || replies.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No unprocessed replies found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;
    const errors: string[] = [];

    // Process each reply
    for (const reply of replies) {
      if (!reply.lead_id) {
        console.warn(`Reply ${reply.id} has no lead_id, skipping`);
        continue;
      }

      try {
        // Find campaign_lead by lead_id and campaign_id
        // If campaign_id is not set, find all campaign_leads for this lead
        let campaignLeadsQuery = supabase
          .from("campaign_leads")
          .select("id, campaign_id, lead_id")
          .eq("lead_id", reply.lead_id);

        if (reply.campaign_id) {
          campaignLeadsQuery = campaignLeadsQuery.eq("campaign_id", reply.campaign_id);
        }

        const { data: campaignLeads, error: clError } = await campaignLeadsQuery;

        if (clError) {
          console.error(`Error finding campaign_leads for lead ${reply.lead_id}:`, clError);
          errors.push(`Lead ${reply.lead_id}: ${clError.message}`);
          continue;
        }

        if (!campaignLeads || campaignLeads.length === 0) {
          console.warn(`No campaign_leads found for lead ${reply.lead_id}, skipping`);
          // Still mark as processed to avoid reprocessing
          await supabase
            .from("email_logs")
            .update({ processed: true })
            .eq("id", reply.id);
          continue;
        }

        // Update all matching campaign_leads
        const stoppedAt = new Date().toISOString();
        for (const cl of campaignLeads) {
          const { error: updateError } = await supabase
            .from("campaign_leads")
            .update({
              is_active: false,
              stopped_at: stoppedAt,
            })
            .eq("id", cl.id);

          if (updateError) {
            console.error(`Error updating campaign_lead ${cl.id}:`, updateError);
            errors.push(`Campaign lead ${cl.id}: ${updateError.message}`);
          }
        }

        // Mark email_log as processed
        const { error: processError } = await supabase
          .from("email_logs")
          .update({ processed: true })
          .eq("id", reply.id);

        if (processError) {
          console.error(`Error marking email_log ${reply.id} as processed:`, processError);
          errors.push(`Email log ${reply.id}: ${processError.message}`);
        } else {
          processedCount++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing reply ${reply.id}:`, errorMsg);
        errors.push(`Reply ${reply.id}: ${errorMsg}`);
      }
    }

    return new Response(
      JSON.stringify({
        processed: processedCount,
        total: replies.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: errors.length > 0 ? 207 : 200, // 207 = Multi-Status if partial errors
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Auto-stop-on-reply error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

