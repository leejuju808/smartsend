// Block 14500 — SmartSend Follow-Up Sequencer v2
// The Behavior-Based Follow-Up Engine That Adjusts Timing, Messaging & Intensity Automatically
// Runs hourly to process due follow-ups

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date().toISOString();

    console.log(`[Follow-Up Sequencer v2] Starting run at ${now}`);

    // ============================================================
    // Run the behavior sequencer to process all due follow-ups
    // ============================================================
    const { data: sequencerResult, error: sequencerError } = await supabase.rpc(
      "run_behavior_sequencer"
    );

    if (sequencerError) {
      console.error("[Follow-Up Sequencer v2] Error running sequencer:", sequencerError);
      throw sequencerError;
    }

    const result = sequencerResult as {
      sent: number;
      stopped: number;
      errors: number;
      processed_at: string;
    };

    console.log(`[Follow-Up Sequencer v2] Processed:`, result);

    // ============================================================
    // Also trigger follow-up scheduling for contacts that need it
    // ============================================================
    let scheduledCount = 0;
    let schedulingErrors = 0;

    // Find contacts that need follow-up scheduling:
    // 1. Contacts with no pending follow-up
    // 2. Contacts that had a follow-up sent recently (need next step)
    // 3. Contacts with recent activity that should trigger follow-up

    // Get contacts that recently had a follow-up sent (schedule next step)
    const { data: recentlySent, error: sentError } = await supabase
      .from("followup_schedule")
      .select("contact_id")
      .eq("status", "sent")
      .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .limit(100);

    if (!sentError && recentlySent) {
      for (const schedule of recentlySent) {
        try {
          // Check if there's already a pending follow-up
          const { data: existing } = await supabase
            .from("followup_schedule")
            .select("id")
            .eq("contact_id", schedule.contact_id)
            .eq("status", "pending")
            .maybeSingle();

          if (!existing) {
            // Schedule next follow-up
            const { error: scheduleError } = await supabase.rpc("schedule_followup", {
              p_contact_id: schedule.contact_id,
            });

            if (scheduleError) {
              console.error(
                `[Follow-Up Sequencer v2] Error scheduling follow-up for contact ${schedule.contact_id}:`,
                scheduleError
              );
              schedulingErrors++;
            } else {
              scheduledCount++;
            }
          }
        } catch (err) {
          console.error(
            `[Follow-Up Sequencer v2] Error processing contact ${schedule.contact_id}:`,
            err
          );
          schedulingErrors++;
        }
      }
    }

    // Get contacts that need initial follow-up scheduling:
    // - Contacts with lead_score > 0 but no follow-up schedule
    // - Contacts with recent messages but no follow-up
    const { data: contactsNeedingFollowup, error: contactsError } = await supabase
      .from("contacts")
      .select("id")
      .gt("lead_score", 0)
      .not("lead_status", "eq", "not_interested")
      .not("lead_status", "eq", "out_of_scope")
      .limit(50);

    if (!contactsError && contactsNeedingFollowup) {
      for (const contact of contactsNeedingFollowup) {
        try {
          // Check if there's already a pending follow-up
          const { data: existing } = await supabase
            .from("followup_schedule")
            .select("id")
            .eq("contact_id", contact.id)
            .eq("status", "pending")
            .maybeSingle();

          if (!existing) {
            // Check if contact has recent activity that warrants follow-up
            const { data: recentMessage } = await supabase
              .from("inbox_messages")
              .select("id")
              .eq("contact_id", contact.id)
              .eq("direction", "in")
              .gte("received_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
              .limit(1)
              .maybeSingle();

            // Only schedule if there's recent activity or it's been 2+ days since last outbound
            const { data: lastOutbound } = await supabase
              .from("inbox_messages")
              .select("received_at")
              .eq("contact_id", contact.id)
              .eq("direction", "out")
              .order("received_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const daysSinceOutbound = lastOutbound
              ? (Date.now() - new Date(lastOutbound.received_at).getTime()) /
                (24 * 60 * 60 * 1000)
              : 999;

            if (recentMessage || daysSinceOutbound >= 2) {
              const { error: scheduleError } = await supabase.rpc("schedule_followup", {
                p_contact_id: contact.id,
              });

              if (scheduleError) {
                // Might be safe-stop condition, that's OK
                if (!scheduleError.message?.includes("should not be scheduled")) {
                  console.error(
                    `[Follow-Up Sequencer v2] Error scheduling follow-up for contact ${contact.id}:`,
                    scheduleError
                  );
                  schedulingErrors++;
                }
              } else {
                scheduledCount++;
              }
            }
          }
        } catch (err) {
          console.error(
            `[Follow-Up Sequencer v2] Error processing contact ${contact.id}:`,
            err
          );
          schedulingErrors++;
        }
      }
    }

    const totalProcessed = (result?.sent || 0) + (result?.stopped || 0);
    const totalScheduled = scheduledCount;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Follow-up sequencer v2 executed successfully",
        processed: {
          sent: result?.sent || 0,
          stopped: result?.stopped || 0,
          errors: result?.errors || 0,
          scheduled: totalScheduled,
          scheduling_errors: schedulingErrors,
        },
        total_processed: totalProcessed,
        processed_at: result?.processed_at || now,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Follow-Up Sequencer v2] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





















































