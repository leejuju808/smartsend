// supabase/functions/classifyLeadReply/index.ts
// Block 97000 — Lead Heat Scoring + Hot Lead Fastlane System
// This edge function classifies homeowner replies and scores them as HOT/WARM/COLD

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

type Intent = "hot" | "warm" | "cold" | "not_interested";

interface ClassificationResult {
  intent: Intent;
  confidence: number;
}

serve(async (req) => {
  try {
    const { user_id, message, message_id, lead_id, workspace_id } = await req.json();

    if (!user_id || !message || !message_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, message, message_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Classify the reply using OpenAI
    const prompt = `You classify roofing lead replies.

Categories:
- HOT = wants estimate, asks about price, wants inspection, gives address, "when can you come", "how much", "I need a quote"
- WARM = interested but uncertain, wants info, "maybe", "what's the cost?", "tell me more", "send me information"
- COLD = generic reply, unclear interest, "thanks", "ok", "got it"
- NOT_INTERESTED = tells you no, stop, not needed, "not interested", "remove me", "unsubscribe"

Reply:
${message}

Return JSON ONLY:
{ "intent": "hot" | "warm" | "cold" | "not_interested", "confidence": 0-1 }`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const result: ClassificationResult = JSON.parse(content);
    const { intent, confidence } = result;

    // Validate intent
    const validIntents: Intent[] = ["hot", "warm", "cold", "not_interested"];
    if (!validIntents.includes(intent)) {
      throw new Error(`Invalid intent: ${intent}`);
    }

    // Validate confidence
    const validConfidence = Math.max(0, Math.min(1, confidence || 0));

    // Get workspace_id if not provided (try to find from lead or user)
    let finalWorkspaceId = workspace_id;
    if (!finalWorkspaceId && lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id, team_id")
        .eq("id", lead_id)
        .maybeSingle();
      
      if (lead?.workspace_id) {
        finalWorkspaceId = lead.workspace_id;
      } else if (lead?.team_id) {
        // Try to get workspace from team
        const { data: team } = await supabase
          .from("teams")
          .select("workspace_id")
          .eq("id", lead.team_id)
          .maybeSingle();
        if (team?.workspace_id) {
          finalWorkspaceId = team.workspace_id;
        }
      }
    }

    // If still no workspace, try from user's workspace_members
    if (!finalWorkspaceId) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .limit(1)
        .maybeSingle();
      if (member?.workspace_id) {
        finalWorkspaceId = member.workspace_id;
      }
    }

    // Save heat event
    const { error: eventError } = await supabase
      .from("lead_heat_events")
      .insert({
        user_id,
        message_id,
        lead_id: lead_id || null,
        workspace_id: finalWorkspaceId || null,
        intent,
        confidence: validConfidence,
        message_text: message.slice(0, 500), // Store first 500 chars
      });

    if (eventError) {
      console.error("Failed to insert heat event:", eventError);
      // Continue anyway - classification is more important
    }

    // Update lead record with heat_score
    if (lead_id) {
      const { error: updateError } = await supabase
        .from("leads")
        .update({ 
          heat_score: intent,
          updated_at: new Date().toISOString()
        })
        .eq("id", lead_id);

      if (updateError) {
        console.error("Failed to update lead heat_score:", updateError);
      }
    }

    // If intent is HOT, we could trigger notifications here
    // (This will be handled by the API route that calls this function)

    return new Response(
      JSON.stringify({
        intent,
        confidence: validConfidence,
        message_id,
        lead_id: lead_id || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("classifyLeadReply error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});


























