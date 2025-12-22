import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeadIntentEvent {
  org_id: string;
  lead_id: string;
  event_type: "open" | "click" | "reply" | "call" | "meeting" | "unsubscribe" | "bounce";
  metadata?: Record<string, any>;
  occurred_at?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === "POST") {
      const body: LeadIntentEvent = await req.json();

      // Validate required fields
      if (!body.org_id || !body.lead_id || !body.event_type) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: org_id, lead_id, event_type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert event (trigger will handle score recomputation)
      const { error: insertError } = await supabase
        .from("lead_events")
        .insert({
          org_id: body.org_id,
          lead_id: body.lead_id,
          event_type: body.event_type,
          metadata: body.metadata || {},
          occurred_at: body.occurred_at || new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }

      // Auto-tagging: Get workspace_id from lead
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", body.lead_id)
        .single();

      if (lead?.workspace_id) {
        // Auto-tag based on event type
        let tagName: string | null = null;
        if (body.event_type === "reply") tagName = "replied";
        else if (body.event_type === "open") tagName = "opened";
        else if (body.event_type === "click") tagName = "clicked";
        else if (body.event_type === "unsubscribe") tagName = "unsubscribe";
        else if (body.event_type === "meeting" || body.metadata?.intent === "meeting_intent") tagName = "meeting_intent";

        if (tagName) {
          await createTagIfMissing(supabase, lead.workspace_id, body.lead_id, tagName);
        }
      }

      // Compute intent score (rule-based, can be replaced with LLM later)
      if (body.event_type === "reply") {
        const intent = computeIntentScore(body.metadata);
        
        // Update intent score
        const { error: updateError } = await supabase
          .from("lead_scores")
          .update({ intent_score: intent })
          .eq("lead_id", body.lead_id);

        if (updateError) {
          console.error("Failed to update intent score:", updateError);
        }

        // Recompute priority with new intent
        await supabase.rpc("fn_update_priority", { p_lead_id: body.lead_id });
      }

      return new Response(
        JSON.stringify({ success: true, message: "Event recorded and scores updated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("lead-intent error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Helper function to get or create a tag and link it to a lead
 */
async function createTagIfMissing(
  supabase: any,
  workspaceId: string,
  leadId: string,
  tagName: string
): Promise<void> {
  try {
    // Get or create tag
    let { data: tag } = await supabase
      .from("lead_tags")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", tagName)
      .maybeSingle();

    if (!tag) {
      const { data: newTag, error: createError } = await supabase
        .from("lead_tags")
        .insert({ workspace_id: workspaceId, name: tagName })
        .select("id")
        .single();

      if (createError) {
        console.error("Failed to create tag:", createError);
        return;
      }
      tag = newTag;
    }

    // Link tag to lead (ignore if already exists due to UNIQUE constraint)
    await supabase
      .from("lead_tag_links")
      .insert({ lead_id: leadId, tag_id: tag.id })
      .catch((err: any) => {
        // Ignore duplicate key errors
        if (!err.message?.includes("duplicate") && !err.message?.includes("unique")) {
          console.error("Failed to link tag:", err);
        }
      });
  } catch (error) {
    console.error("Error in createTagIfMissing:", error);
    // Don't throw - auto-tagging should not block event recording
  }
}

/**
 * Compute intent score from reply metadata (rule-based stub)
 * Later: replace with LLM classifier for positive/neutral/negative
 */
function computeIntentScore(metadata?: Record<string, any>): number {
  if (!metadata) return 30; // Default neutral

  const replyText = (metadata.reply_text || "").toLowerCase();
  
  // Positive signals
  const positiveKeywords = ["interested", "interested", "schedule", "sounds great", "yes", "love", "excited"];
  const negativeKeywords = ["not interested", "unsubscribe", "stop", "no thanks", "never", "remove"];
  
  let score = 30; // Start neutral
  
  const positiveCount = positiveKeywords.filter(k => replyText.includes(k)).length;
  const negativeCount = negativeKeywords.filter(k => replyText.includes(k)).length;
  
  if (positiveCount > 0) {
    score = 60 + Math.min(positiveCount * 10, 30); // Up to 90
  }
  
  if (negativeCount > 0) {
    score = 10 - Math.min(negativeCount * 5, 10); // Down to 0
  }
  
  return Math.max(0, Math.min(100, score));
}

