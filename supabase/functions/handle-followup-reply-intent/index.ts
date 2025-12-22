import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Block 8880 — Reply Event Handler
 * Processes reply intents and applies positive/negative intent rules
 * 
 * This function should be called when a reply is classified with intent.
 * Input: contact_id, campaign_id, intent (hot, warm, neutral, negative, unsubscribe, etc.), message_id
 */
serve(async (req) => {
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

    const body = await req.json();
    const { contact_id, campaign_id, intent, message_id, account_id } = body;

    if (!contact_id || !campaign_id || !intent) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: contact_id, campaign_id, intent" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log(`Processing reply intent for contact ${contact_id}, campaign ${campaign_id}, intent: ${intent}`);

    // Get account_id from campaign if not provided
    let finalAccountId = account_id;
    if (!finalAccountId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("account_id")
        .eq("id", campaign_id)
        .single();

      if (campaign) {
        finalAccountId = campaign.account_id;
      }
    }

    if (!finalAccountId) {
      return new Response(
        JSON.stringify({ error: "Could not determine account_id" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // 1. Get or create stats record
    const { data: stats, error: statsError } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("contact_id", contact_id)
      .maybeSingle();

    if (statsError) {
      console.error("Failed to fetch stats:", statsError);
    }

    // Update stats with latest inbound and intent
    const statsUpdate: any = {
      account_id: finalAccountId,
      campaign_id,
      contact_id,
      last_inbound_at: new Date().toISOString(),
      last_intent: intent,
    };

    if (!stats) {
      await supabase.from("lead_auto_follow_up_stats").insert(statsUpdate);
    } else {
      await supabase
        .from("lead_auto_follow_up_stats")
        .update(statsUpdate)
        .eq("id", stats.id);
    }

    // 2. Get follow-up program for this campaign
    const { data: program, error: programError } = await supabase
      .from("follow_up_programs")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("is_enabled", true)
      .maybeSingle();

    if (programError || !program) {
      console.log(`No follow-up program found for campaign ${campaign_id}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "No follow-up program found for this campaign",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 3. Load positive and negative intent rules
    const { data: positiveRules, error: positiveError } = await supabase
      .from("follow_up_rules")
      .select("*")
      .eq("program_id", program.id)
      .eq("type", "positive_intent")
      .eq("is_enabled", true);

    const { data: negativeRules, error: negativeError } = await supabase
      .from("follow_up_rules")
      .select("*")
      .eq("program_id", program.id)
      .eq("type", "negative_intent")
      .eq("is_enabled", true);

    // Normalize intent to lowercase for matching
    const normalizedIntent = intent.toLowerCase();

    // 4. Check positive intent rules
    if (positiveRules && positiveRules.length > 0) {
      for (const rule of positiveRules) {
        if (
          rule.intent_match_any &&
          rule.intent_match_any.some(
            (match: string) => match.toLowerCase() === normalizedIntent
          )
        ) {
          // Positive intent matched - stop all future follow-ups
          await supabase
            .from("lead_auto_follow_up_stats")
            .update({ auto_follow_up_disabled: true })
            .eq("campaign_id", campaign_id)
            .eq("contact_id", contact_id);

          // Log event
          await supabase.from("follow_up_events").insert({
            account_id: finalAccountId,
            campaign_id,
            contact_id,
            message_id: message_id || null,
            rule_id: rule.id,
            event_type: "stopped_by_positive_intent",
            details: {
              intent,
              matched_intents: rule.intent_match_any,
            },
          });

          console.log(`Stopped follow-ups for contact ${contact_id} due to positive intent: ${intent}`);
        }
      }
    }

    // 5. Check negative intent rules
    if (negativeRules && negativeRules.length > 0) {
      for (const rule of negativeRules) {
        if (
          rule.intent_match_any &&
          rule.intent_match_any.some(
            (match: string) => match.toLowerCase() === normalizedIntent
          )
        ) {
          // Negative intent matched - stop all future follow-ups
          await supabase
            .from("lead_auto_follow_up_stats")
            .update({ auto_follow_up_disabled: true })
            .eq("campaign_id", campaign_id)
            .eq("contact_id", contact_id);

          // Add to suppression if configured
          if (rule.add_to_suppression) {
            // Get contact email
            const { data: contact } = await supabase
              .from("contacts")
              .select("email")
              .eq("id", contact_id)
              .single();

            if (contact) {
              // Add to global suppression list (Block 8230)
              await supabase.from("suppression_list").upsert({
                account_id: finalAccountId,
                email: contact.email.toLowerCase(),
                scope: "account",
                reason: "unsubscribe",
                source: "auto_followup",
              }, {
                onConflict: "account_id,scope,campaign_id,email",
              });

              // Also add to campaign-level suppression
              await supabase.from("suppression_list").upsert({
                account_id: finalAccountId,
                campaign_id,
                email: contact.email.toLowerCase(),
                scope: "campaign",
                reason: "unsubscribe",
                source: "auto_followup",
              }, {
                onConflict: "account_id,scope,campaign_id,email",
              });
            }
          }

          // Log event
          await supabase.from("follow_up_events").insert({
            account_id: finalAccountId,
            campaign_id,
            contact_id,
            message_id: message_id || null,
            rule_id: rule.id,
            event_type: "stopped_by_negative_intent",
            details: {
              intent,
              matched_intents: rule.intent_match_any,
              added_to_suppression: rule.add_to_suppression,
            },
          });

          console.log(`Stopped follow-ups for contact ${contact_id} due to negative intent: ${intent}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Reply intent processed",
        contact_id,
        campaign_id,
        intent,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing reply intent:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
























































