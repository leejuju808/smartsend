// Edge Function: detect-service-request
// AI-powered warranty and service request detection from homeowner messages
// Automatically creates service tickets when warranty/service requests are detected

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

interface ServiceRequestDetection {
  issue_type: "leak" | "shingle_loss" | "vent_issue" | "flashing" | "gutter" | "unknown";
  urgency: "emergency" | "high" | "normal";
  warranty_likely: boolean;
  summary: string;
  recommended_action?: string;
}

async function detectServiceRequest(message: string): Promise<ServiceRequestDetection> {
  const prompt = `You are analyzing a homeowner message for a roofing company. Determine if this is a warranty or service request.

Homeowner message:
"${message}"

Classify the issue type:
- leak: Water leaking, dripping, moisture, water damage
- shingle_loss: Missing shingles, shingles blown off, shingles damaged
- vent_issue: Vent problems, vent flashing issues, vent leaks
- flashing: Flashing problems, flashing leaks, flashing damage
- gutter: Gutter issues, loose gutters, gutter problems
- unknown: Cannot determine or unrelated to roofing

Determine urgency:
- emergency: Active leak, water coming in, immediate danger, storm damage happening now
- high: Significant issue but not immediate danger, needs attention soon
- normal: Minor issue, routine maintenance, non-urgent

Is this likely a warranty issue? Consider:
- Is it related to the original installation?
- Is it within warranty period (typically 5-30 years)?
- Is it installer error vs storm damage vs homeowner-caused?

Return JSON only:
{
  "issue_type": "one of the types above",
  "urgency": "emergency" | "high" | "normal",
  "warranty_likely": true or false,
  "summary": "one sentence summary",
  "recommended_action": "brief recommended action if clear"
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing roofing warranty and service requests. Return only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const contentStr = data.choices?.[0]?.message?.content || "{}";

    try {
      const parsed = JSON.parse(contentStr);
      return {
        issue_type: parsed.issue_type || "unknown",
        urgency: parsed.urgency || "normal",
        warranty_likely: parsed.warranty_likely === true,
        summary: parsed.summary || message.substring(0, 200),
        recommended_action: parsed.recommended_action,
      };
    } catch (e) {
      console.error("Failed to parse OpenAI response:", contentStr);
      return {
        issue_type: "unknown",
        urgency: "normal",
        warranty_likely: false,
        summary: message.substring(0, 200),
      };
    }
  } catch (error) {
    console.error("Error detecting service request:", error);
    return {
      issue_type: "unknown",
      urgency: "normal",
      warranty_likely: false,
      summary: message.substring(0, 200),
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { lead_id, message, job_id, workspace_id } = await req.json();

    if (!lead_id || !message) {
      return new Response(
        JSON.stringify({ error: "lead_id and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Detect service request
    const detection = await detectServiceRequest(message);

    // Only create ticket if it's actually a service/warranty request
    // Check if message contains service-related keywords
    const serviceKeywords = [
      "leak", "leaking", "dripping", "water",
      "shingle", "shingles", "blown off", "missing",
      "vent", "flashing", "gutter",
      "warranty", "repair", "fix", "broken", "damage"
    ];
    
    const messageLower = message.toLowerCase();
    const isServiceRequest = serviceKeywords.some(keyword => messageLower.includes(keyword));

    if (!isServiceRequest && detection.issue_type === "unknown") {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          is_service_request: false,
          detection 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get workspace_id if not provided
    let final_workspace_id = workspace_id;
    if (!final_workspace_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id, user_id")
        .eq("id", lead_id)
        .single();
      
      if (lead?.workspace_id) {
        final_workspace_id = lead.workspace_id;
      } else if (lead?.user_id) {
        // Try to get workspace from user
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("id")
          .eq("user_id", lead.user_id)
          .limit(1)
          .single();
        
        if (workspace) {
          final_workspace_id = workspace.id;
        }
      }
    }

    // Create service ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .insert({
        lead_id,
        job_id: job_id || null,
        workspace_id: final_workspace_id,
        issue_type: detection.issue_type,
        urgency: detection.urgency,
        description: message,
        covered: detection.warranty_likely,
        warranty_determination: detection.warranty_likely ? "warranty_covered" : "pending",
        recommended_action: detection.recommended_action,
        status: "open",
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Error creating service ticket:", ticketError);
      return new Response(
        JSON.stringify({ error: "Failed to create service ticket", details: ticketError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check for warranty abuse
    if (final_workspace_id) {
      const { data: abuseData } = await supabase.rpc("detect_warranty_abuse", {
        p_lead_id: lead_id,
      });

      if (abuseData?.is_abuse) {
        // Flag the ticket
        await supabase
          .from("service_tickets")
          .update({
            abuse_flag: true,
            abuse_reason: `Potential warranty abuse: ${abuseData.not_covered_count} not-covered claims, ${abuseData.recent_claims} recent claims`,
          })
          .eq("id", ticket.id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        is_service_request: true,
        ticket,
        detection,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "access-control-allow-origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in detect-service-request:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "access-control-allow-origin": "*",
        },
      }
    );
  }
});
































