// Block 21728 — SmartSend Roofing Lead Status Brain v1
// Edge Function — AI Reply Classification + Status Update
// This function classifies homeowner replies as hot, warm, or cold
// and automatically updates the lead status

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { lead_id, reply_text } = await req.json();

    if (!lead_id || !reply_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id and reply_text" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // === AI CLASSIFICATION ===
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You classify homeowner replies for a ROOFING company.

You must respond with exactly ONE word:
- "hot"
- "warm"
- "cold"

Definitions:
- hot: wants an estimate, asks for availability, shares phone/address, mentions leaks/storm damage/urgent issues, or clearly wants to move forward.
- warm: interested but not ready yet, gathering quotes, asking general questions, wants info first, timing is unclear.
- cold: not interested, wrong contact, tells us to stop, already hired someone else, or clearly a dead end.`,
          },
          {
            role: "user",
            content: reply_text,
          },
        ],
        temperature: 0.3,
        max_tokens: 10,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI classification failed", details: errorText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const aiStatus = aiData.choices?.[0]?.message?.content?.trim().toLowerCase();

    if (!aiStatus || !["hot", "warm", "cold"].includes(aiStatus)) {
      console.error("Invalid AI response:", aiStatus);
      return new Response(
        JSON.stringify({ error: "Invalid AI classification result" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // === Update Lead Status ===
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .update({
        status: aiStatus,
        last_reply_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id)
      .select("*")
      .single();

    if (leadErr) {
      console.error("Failed to update lead:", leadErr);
      return new Response(
        JSON.stringify({ error: "Failed to update lead status", details: leadErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Block 21734: Create call task if status is HOT
    if (aiStatus === "hot") {
      try {
        await supabase.rpc("create_call_task_if_needed", {
          p_lead_id: lead_id,
          p_source: "ai_hot_lead",
        });
      } catch (callTaskErr) {
        console.error("Failed to create call task:", callTaskErr);
        // Don't fail the whole request if call task creation fails
      }
    }

    // === Log Timeline Event ===
    const addEventUrl = Deno.env.get("ADD_LEAD_EVENT_URL");
    if (addEventUrl) {
      try {
        await fetch(addEventUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lead_id,
            event_type: "status_changed",
            event_subtype: `ai_${aiStatus}`,
            message: `Lead classified as ${aiStatus.toUpperCase()} by AI based on reply`,
            metadata: {
              reply_text: reply_text.substring(0, 500), // Truncate for storage
              classification_model: "gpt-4o-mini",
            },
          }),
        });
      } catch (eventErr) {
        console.error("Failed to log timeline event:", eventErr);
        // Don't fail the whole request if timeline logging fails
      }
    } else {
      // Fallback: insert directly if ADD_LEAD_EVENT_URL not set
      await supabase.from("lead_timeline_events").insert({
        lead_id,
        event_type: "status_changed",
        event_subtype: `ai_${aiStatus}`,
        message: `Lead classified as ${aiStatus.toUpperCase()} by AI based on reply`,
        metadata: {
          reply_text: reply_text.substring(0, 500),
          classification_model: "gpt-4o-mini",
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        new_status: aiStatus,
        lead_id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

