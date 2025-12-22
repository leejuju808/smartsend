// Block 21736 — SmartSend Roofing Appointment Brain v1
// AI Scheduling Detection Edge Function
// 
// This function analyzes homeowner replies for ROOFING appointment intent.
// Returns JSON with wants_appointment flag and proposed_time if detected.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SchedulingDetectionRequest {
  reply_text: string;
  lead_id?: string;
}

interface SchedulingDetectionResponse {
  wants_appointment: boolean;
  proposed_time: string | null;
  notes: string;
}

const SYSTEM_PROMPT = `You analyze homeowner replies for ROOFING appointment intent.

Return JSON:
{
  "wants_appointment": true/false,
  "proposed_time": "2025-12-02T15:00:00Z" or null,
  "notes": "Customer asked for Friday afternoon"
}

Rules:
- If homeowner mentions a specific day/time or asks for availability → wants_appointment=true.
- Accept natural language like "Friday", "tomorrow morning", "this week", "next week", "when can you come out", "can you do Friday", "what times work".
- Parse dates relative to today. If they say "Friday" and today is Tuesday, that's 3 days from now at a reasonable time (e.g., 10 AM local).
- If unclear or no scheduling intent, set wants_appointment=false.
- proposed_time should be ISO 8601 format in UTC, or null if no specific time mentioned.
- notes should be a brief description of what the customer said about scheduling.

Examples:
- "We're available Friday" → wants_appointment=true, proposed_time=Friday 10:00 AM UTC, notes="Customer available Friday"
- "Can you come out this week?" → wants_appointment=true, proposed_time=null, notes="Customer asked for this week"
- "What times work for you?" → wants_appointment=true, proposed_time=null, notes="Customer asking for availability"
- "Thanks for the info" → wants_appointment=false, proposed_time=null, notes="No scheduling intent detected"`;

async function detectSchedulingIntent(
  replyText: string
): Promise<SchedulingDetectionResponse> {
  if (!OPENAI_API_KEY) {
    console.warn:OPENAI_API_KEY not set");
    return {
      wants_appointment: false,
      proposed_time: null,
      notes: "AI service not configured",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Using mini for cost efficiency
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: replyText },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3, // Lower temperature for more consistent detection
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return {
        wants_appointment: false,
        proposed_time: null,
        notes: `AI service error: ${response.status}`,
      };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return {
        wants_appointment: false,
        proposed_time: null,
        notes: "No response from AI",
      };
    }

    const parsed = JSON.parse(content);

    // Validate and normalize response
    return {
      wants_appointment: Boolean(parsed.wants_appointment),
      proposed_time: parsed.proposed_time || null,
      notes: parsed.notes || "Scheduling intent detected",
    };
  } catch (error) {
    console.error("Error detecting scheduling intent:", error);
    return {
      wants_appointment: false,
      proposed_time: null,
      notes: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, content-type",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload: SchedulingDetectionRequest = await req.json();

    if (!payload.reply_text) {
      return new Response(
        JSON.stringify({ error: "reply_text is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await detectSchedulingIntent(payload.reply_text);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Unexpected error in ai-detect-scheduling:", error);
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










































