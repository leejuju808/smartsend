// Block 30041 — SmartSend Roofing "Storm Event Lead Surge Engine" v1
// Edge Function: /storm-boost
// 
// Applies storm boost scores to leads in affected areas and classifies storm messages

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Storm urgency keywords and their boost values
const STORM_KEYWORDS = {
  storm_urgency: {
    keywords: [
      /water coming in/i,
      /hole in roof/i,
      /hail broke shingles/i,
      /need help asap/i,
      /emergency/i,
      /urgent/i,
      /leaking/i,
      /water damage/i,
      /roof damaged/i,
    ],
    boost: 40,
  },
  insurance_flag: {
    keywords: [
      /insurance/i,
      /claim/i,
      /adjuster/i,
      /coverage/i,
      /file a claim/i,
    ],
    boost: 20,
  },
  high_risk_weather_zone: {
    keywords: [
      /storm/i,
      /hail/i,
      /wind damage/i,
      /severe weather/i,
    ],
    boost: 10,
  },
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get active storm flags
    const { data: activeStorms, error: stormsError } = await supabase
      .from("storm_flags")
      .select("*")
      .eq("active", true);

    if (stormsError) {
      throw stormsError;
    }

    if (!activeStorms || activeStorms.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, message: "No active storms" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Collect all active storm event IDs
    const allStormEventIds = new Set<string>();
    for (const flag of activeStorms) {
      if (flag.active_storm_event_ids) {
        for (const id of flag.active_storm_event_ids) {
          allStormEventIds.add(id);
        }
      }
    }

    if (allStormEventIds.size === 0) {
      return new Response(
        JSON.stringify({ ok: false, message: "No active storm events" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get all affected ZIP codes from storm events
    const { data: stormEvents, error: eventsError } = await supabase
      .from("storm_events")
      .select("id, zip_code")
      .in("id", Array.from(allStormEventIds));

    if (eventsError) {
      throw eventsError;
    }

    if (!stormEvents || stormEvents.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, message: "No storm events found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const affectedZipCodes = new Set(stormEvents.map((e) => e.zip_code));
    const zipToStormMap = new Map<string, string>();
    for (const event of stormEvents) {
      zipToStormMap.set(event.zip_code, event.id);
    }

    // Find leads in affected ZIP codes
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, zip_code, workspace_id")
      .in("zip_code", Array.from(affectedZipCodes));

    if (leadsError) {
      throw leadsError;
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No leads in affected areas", leads_boosted: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let leadsBoosted = 0;
    let leadsClassified = 0;

    // Process each lead
    for (const lead of leads) {
      if (!lead.zip_code) continue;

      const stormEventId = zipToStormMap.get(lead.zip_code);
      if (!stormEventId) continue;

      // Check if lead already has storm boost (to avoid duplicate boosts)
      const { data: existingStormLead } = await supabase
        .from("storm_leads")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("storm_event_id", stormEventId)
        .single();

      if (existingStormLead) {
        // Lead already processed, skip or update if needed
        continue;
      }

      // Apply base storm boost
      const { error: boostError } = await supabase.rpc(
        "apply_storm_boost_to_lead",
        {
          p_lead_id: lead.id,
          p_storm_event_id: stormEventId,
          p_signal: "high_risk_weather_zone",
          p_value: STORM_KEYWORDS.high_risk_weather_zone.boost,
        }
      );

      if (boostError) {
        console.error(`Error boosting lead ${lead.id}:`, boostError);
        continue;
      }

      leadsBoosted++;

      // Check for recent messages that might indicate storm damage
      const { data: messages, error: messagesError } = await supabase
        .from("inbound_messages")
        .select("id, text_body, html_body, created_at")
        .eq("lead_id", lead.id)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order("created_at", { ascending: false })
        .limit(10);

      if (!messagesError && messages && messages.length > 0) {
        // Check messages for storm urgency keywords
        for (const message of messages) {
          const messageText = (message.text_body || message.html_body || "").toLowerCase();

          for (const [signal, config] of Object.entries(STORM_KEYWORDS)) {
            const hasKeyword = config.keywords.some((pattern) =>
              pattern.test(messageText)
            );

            if (hasKeyword) {
              // Apply additional boost
              const { error: signalError } = await supabase.rpc(
                "apply_storm_boost_to_lead",
                {
                  p_lead_id: lead.id,
                  p_storm_event_id: stormEventId,
                  p_signal: signal,
                  p_value: config.boost,
                  p_message_snippet: messageText.substring(0, 200),
                }
              );

              if (!signalError) {
                // Update classification
                const { error: classifyError } = await supabase.rpc(
                  "update_storm_lead_classification",
                  {
                    p_lead_id: lead.id,
                    p_message_body: messageText,
                  }
                );

                if (!classifyError) {
                  leadsClassified++;
                }
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        leads_boosted,
        leads_classified,
        active_storms: activeStorms.length,
        affected_zip_codes: affectedZipCodes.size,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in storm-boost:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});


































