// Block 30519 — SmartSend Roofing "Smart Phone Call Capture + Missed Call AI Responder" v1
// Edge Function: Classify Call Intent
// Classifies customer SMS reply and creates lead with intent

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { call_id, reply_text, phone, contractor_id, workspace_id } = await req.json();

    if (!call_id || !reply_text || !phone) {
      return new Response(
        JSON.stringify({ error: "call_id, reply_text, and phone are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get call log to verify it exists
    const { data: callLog, error: callError } = await supabase
      .from("call_logs")
      .select("*")
      .eq("id", call_id)
      .single();

    if (callError || !callLog) {
      return new Response(
        JSON.stringify({ error: "Call log not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace_id if not provided
    let finalWorkspaceId = workspace_id || callLog.workspace_id;
    if (!finalWorkspaceId && contractor_id) {
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", contractor_id)
        .limit(1)
        .maybeSingle();

      if (workspaceMember) {
        finalWorkspaceId = workspaceMember.workspace_id;
      }
    }

    if (!finalWorkspaceId) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Classify intent using OpenAI
    const prompt = `Classify this customer reply into EXACTLY one roofing intent. Return ONLY the label, nothing else.

Options:
- emergency_leak
- repair_request
- full_replacement
- storm_damage
- general_question

Message: "${reply_text}"

Return the label only:`;

    let intent = "general_question"; // Default
    let confidence = 0.5;

    try {
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a roofing intent classifier. Return ONLY the label, nothing else. Valid labels: emergency_leak, repair_request, full_replacement, storm_damage, general_question"
            },
            { role: "user", content: prompt }
          ],
          max_tokens: 8,
          temperature: 0.1,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const classifiedIntent = data.choices?.[0]?.message?.content?.trim().toLowerCase();
        
        // Validate intent
        const validIntents = ["emergency_leak", "repair_request", "full_replacement", "storm_damage", "general_question"];
        if (validIntents.includes(classifiedIntent)) {
          intent = classifiedIntent;
          confidence = 0.9; // High confidence for GPT-4o-mini
        } else {
          console.warn(`Invalid intent returned: ${classifiedIntent}, using default`);
        }
      } else {
        const errorData = await response.json();
        console.error("OpenAI API error:", errorData);
        // Continue with default intent
      }
    } catch (aiError) {
      console.error("Error calling OpenAI:", aiError);
      // Continue with default intent
    }

    // Save intent
    const { data: callIntent, error: intentError } = await supabase
      .from("call_intents")
      .insert({
        call_id: call_id,
        predicted_intent: intent,
        confidence: confidence,
        reply_text: reply_text,
      })
      .select()
      .single();

    if (intentError) {
      console.error("Error saving intent:", intentError);
      // Continue even if intent save fails
    }

    // Check if lead already exists for this phone number
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", finalWorkspaceId)
      .eq("phone", phone)
      .maybeSingle();

    let leadId = existingLead?.id;

    // Create or update lead
    if (!leadId) {
      // Extract name from reply if possible (simple heuristic)
      const nameMatch = reply_text.match(/(?:this is|i'm|i am|my name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      const firstName = nameMatch ? nameMatch[1].split(" ")[0] : null;
      const lastName = nameMatch && nameMatch[1].split(" ").length > 1 
        ? nameMatch[1].split(" ").slice(1).join(" ") 
        : null;

      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          workspace_id: finalWorkspaceId,
          phone: phone,
          first_name: firstName || null,
          last_name: lastName || null,
          source: "phone_call",
          status: "new",
          // Store intent in metadata or custom field if available
        })
        .select()
        .single();

      if (leadError) {
        console.error("Error creating lead:", leadError);
        return new Response(
          JSON.stringify({ error: leadError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      leadId = newLead.id;
    }

    // Link call → lead
    const { error: mapError } = await supabase
      .from("call_to_lead_map")
      .insert({
        call_id: call_id,
        lead_id: leadId,
      })
      .select()
      .single();

    if (mapError) {
      console.error("Error linking call to lead:", mapError);
      // Continue even if mapping fails
    }

    // Boost score
    try {
      await supabase.rpc("update_lead_score_from_call", {
        p_lead_id: leadId,
        p_event_type: "missed_call",
      });

      // Additional boost for emergency keywords
      if (intent === "emergency_leak") {
        await supabase.rpc("update_lead_score_from_call", {
          p_lead_id: leadId,
          p_event_type: "emergency_keywords",
        });
      }
    } catch (scoreError) {
      console.error("Error updating lead score:", scoreError);
      // Non-critical, continue
    }

    // Add timeline event
    try {
      await supabase
        .from("lead_timeline_events")
        .insert({
          lead_id: leadId,
          event_type: "call_logged",
          event_subtype: "missed_call_reply",
          message: `Customer replied to missed call: "${reply_text}" (Intent: ${intent})`,
          metadata: {
            call_id: call_id,
            intent: intent,
            confidence: confidence,
          },
        });
    } catch (timelineError) {
      console.error("Error adding timeline event:", timelineError);
      // Non-critical
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        lead_id: leadId,
        intent: intent,
        confidence: confidence,
        message: "Intent classified and lead created/updated"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































