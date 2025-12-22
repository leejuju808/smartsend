// Block 40210 — SmartSend Roofing "Storm Response + Rapid Deployment Engine" v1
// Edge Function: /storm-damage-classify
// 
// AI-powered damage classification from homeowner messages

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ClassificationResult {
  damage_type: "hail" | "wind" | "missing_shingles" | "leak" | "tree" | "unknown";
  urgency: "emergency" | "urgent" | "routine";
  confidence?: number;
  reasoning?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, lead_id, storm_event_id } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use OpenAI to classify damage
    const classification = await classifyDamageWithAI(message);

    // If lead_id and storm_event_id provided, update storm_leads
    if (lead_id && storm_event_id) {
      const { error: updateError } = await supabase
        .from("storm_leads")
        .update({
          damage_type: classification.damage_type,
          urgency: classification.urgency,
          description: message.substring(0, 500), // Store first 500 chars
        })
        .eq("lead_id", lead_id)
        .eq("storm_event_id", storm_event_id);

      if (updateError) {
        console.error("Error updating storm lead:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        classification,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in storm-damage-classify:", error);
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

async function classifyDamageWithAI(
  message: string
): Promise<ClassificationResult> {
  const prompt = `You are a roofing damage classification expert. Analyze the following homeowner message and classify the storm damage.

Message: "${message}"

Classify the damage type and urgency level. Return ONLY valid JSON in this exact format:
{
  "damage_type": "hail" | "wind" | "missing_shingles" | "leak" | "tree" | "unknown",
  "urgency": "emergency" | "urgent" | "routine",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Guidelines:
- "emergency": Water actively entering home, structural damage, immediate safety risk (1-24 hours)
- "urgent": Damage that needs attention soon but not immediately dangerous (24-72 hours)
- "routine": Minor damage, cosmetic issues, general inspections (3-10 days)
- "leak": Active water intrusion, wet ceilings/walls, flooding
- "hail": Hail damage mentioned, dents, broken shingles from hail
- "wind": Wind damage, shingles blown off, wind-related issues
- "missing_shingles": Shingles missing, exposed roof
- "tree": Tree fell on roof, tree impact damage
- "unknown": Cannot determine from message

Return ONLY the JSON object, no other text.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content:
              "You are a roofing damage classification expert. Always return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse JSON from response (handle markdown code blocks if present)
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    }

    const result: ClassificationResult = JSON.parse(jsonStr);

    // Validate result
    const validDamageTypes = [
      "hail",
      "wind",
      "missing_shingles",
      "leak",
      "tree",
      "unknown",
    ];
    const validUrgencies = ["emergency", "urgent", "routine"];

    if (!validDamageTypes.includes(result.damage_type)) {
      result.damage_type = "unknown";
    }
    if (!validUrgencies.includes(result.urgency)) {
      result.urgency = "routine";
    }

    return result;
  } catch (error) {
    console.error("Error calling OpenAI:", error);

    // Fallback to rule-based classification
    return classifyDamageFallback(message);
  }
}

function classifyDamageFallback(message: string): ClassificationResult {
  const lowerMessage = message.toLowerCase();

  // Determine damage type
  let damage_type: ClassificationResult["damage_type"] = "unknown";
  if (lowerMessage.match(/hail|dents?|hailstone/i)) {
    damage_type = "hail";
  } else if (lowerMessage.match(/wind|blown|torn off|shingles? missing/i)) {
    damage_type = "wind";
  } else if (lowerMessage.match(/missing shingles?|exposed|shingles? off/i)) {
    damage_type = "missing_shingles";
  } else if (
    lowerMessage.match(/leak|water|flood|wet|dripping|coming in|entering/i)
  ) {
    damage_type = "leak";
  } else if (lowerMessage.match(/tree|branch|limb|fell on/i)) {
    damage_type = "tree";
  }

  // Determine urgency
  let urgency: ClassificationResult["urgency"] = "routine";
  if (
    lowerMessage.match(
      /emergency|urgent|asap|immediately|right now|water coming in|flooding|wet ceiling|wet wall|hole|dangerous|unsafe/i
    )
  ) {
    urgency = "emergency";
  } else if (
    lowerMessage.match(
      /soon|quickly|damage|broken|need help|problem|issue|concern/i
    )
  ) {
    urgency = "urgent";
  }

  return {
    damage_type,
    urgency,
    confidence: 0.6,
    reasoning: "Fallback rule-based classification",
  };
}
































