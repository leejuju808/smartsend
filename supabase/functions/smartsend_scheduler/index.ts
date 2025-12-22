// Block 8100 - SmartSend Scheduler Sync
// Block 8900 - Upgraded to use sequence steps
// Runs every minute to sync campaigns → queue
// Pulls leads ready for next step and enqueues them

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    const now = new Date().toISOString();

    // 1. Get active campaigns whose next_run is <= now
    // Block 9900: Include sending account info
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("*, sending_account:sending_account_id (id, provider, from_email, from_name, status)")
      .eq("status", "running")
      .lte("next_run", now);

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch campaigns", details: campaignsError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ message: "No campaigns ready", processed: 0 }),
        { headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    for (const camp of campaigns) {
      try {
        // Block 10000: Skip campaigns whose sending account is throttled
        if (camp.sending_account && camp.sending_account.status === "throttled") {
          await supabase.from("logs").insert({
            scope: "safety",
            message: `Campaign ${camp.id} skipped: sending account ${camp.sending_account.from_email} throttled`
          }).catch(() => {});
          continue;
        }

        // Block 8900: Select leads ready for next step
        // Block 9700: Filter out do_not_contact leads (unsubscribed/bounced)
        // Get leads that are pending and have next_step_at <= now (or null for first step)
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select("*")
          .eq("campaign_id", camp.id)
          .eq("status", "pending")
          .eq("do_not_contact", false)
          .or(`next_step_at.is.null,next_step_at.lte.${now}`)
          .order("created_at", { ascending: true })
          .limit(10); // Process up to 10 leads per campaign per run

        if (leadsError) {
          console.error(`Error fetching leads for campaign ${camp.id}:`, leadsError);
          errors.push(`Campaign ${camp.id}: ${leadsError.message}`);
          continue;
        }

        if (!leads || leads.length === 0) {
          continue;
        }

        // Block 9800: Get suppression list for user (once per campaign/user in the loop)
        const { data: suppressions } = await supabase
          .from("smartsend_suppressions")
          .select("email,domain")
          .eq("user_id", camp.user_id);

        const suppressedEmails = new Set(
          (suppressions || []).map((s: any) => s.email?.toLowerCase()).filter(Boolean)
        );

        const suppressedDomains = new Set(
          (suppressions || []).map((s: any) => s.domain?.toLowerCase()).filter(Boolean)
        );

        // Filter out suppressed leads
        const safeLeads = (leads || []).filter((lead: any) => {
          if (!lead.email) return false;
          const email = lead.email.toLowerCase();
          const domain = email.split("@")[1]?.toLowerCase();
          if (lead.do_not_contact) return false;
          if (suppressedEmails.has(email)) return false;
          if (domain && suppressedDomains.has(domain)) return false;
          return true;
        });

        for (const lead of safeLeads) {
          try {
            // Check if lead is already in queue
            const { data: existingQueue } = await supabase
              .from("smartsend_queue")
              .select("id")
              .eq("lead_id", lead.id)
              .in("status", ["pending", "processing", "retry"])
              .limit(1);

            if (existingQueue && existingQueue.length > 0) {
              // Already queued, skip
              continue;
            }

            // Block 8900: Get the step for this lead's current_step
            const { data: step, error: stepError } = await supabase.rpc("smartsend_get_next_step", {
              p_campaign_id: camp.id,
              p_current_step: lead.current_step || 1,
            });

            if (stepError) {
              console.error(`Error getting step for lead ${lead.id}:`, stepError);
              continue;
            }

            // If no step exists → end sequence for that lead
            if (!step) {
              await supabase
                .from("leads")
                .update({ status: "completed" })
                .eq("id", lead.id);
              continue;
            }

            // Block 9900: Check if campaign has sending account configured
            if (!camp.sending_account_id) {
              // Skip or log warning - no sending account configured
              console.warn(`Campaign ${camp.id} has no sending_account_id configured, skipping lead ${lead.id}`);
              continue;
            }

            // Block 8900: Enqueue with step information
            // Block 9900: Include sending_account_id from campaign
            const { error: enqueueError } = await supabase.from("smartsend_queue").insert({
              campaign_id: camp.id,
              lead_id: lead.id,
              step_position: step.position,
              subject: step.subject,
              body: step.body,
              scheduled_at: now,
              sending_account_id: camp.sending_account_id,
            });

            if (enqueueError) {
              console.error(`Error enqueueing lead ${lead.id}:`, enqueueError);
              errors.push(`Lead ${lead.id}: ${enqueueError.message}`);
              continue;
            }

            processed++;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`Error processing lead ${lead.id}:`, errorMsg);
            errors.push(`Lead ${lead.id}: ${errorMsg}`);
          }
        }

        // 4. Update campaign.next_run based on the user's send interval
        const sendIntervalSeconds = camp.send_interval_seconds || 60; // Default 60 seconds
        const nextRun = new Date(Date.now() + sendIntervalSeconds * 1000).toISOString();

        const { error: updateError } = await supabase
          .from("campaigns")
          .update({ next_run: nextRun })
          .eq("id", camp.id);

        if (updateError) {
          console.error(`Error updating next_run for campaign ${camp.id}:`, updateError);
          errors.push(`Campaign ${camp.id}: ${updateError.message}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing campaign ${camp.id}:`, errorMsg);
        errors.push(`Campaign ${camp.id}: ${errorMsg}`);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Scheduler Sync Completed",
        processed,
        campaigns_checked: campaigns.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Scheduler error:", errorMsg);
    return new Response(
      JSON.stringify({ error: "Scheduler failed", details: errorMsg }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

