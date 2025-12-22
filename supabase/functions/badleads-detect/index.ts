// supabase/functions/badleads-detect/index.ts
// Block 17800 — Bad Lead Detection Worker

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BadLeadDetectionRequest {
  workspace_id: string;
  email: string;
  text?: string; // For not-interested detection
  behavior?: Record<string, unknown>; // For time-waster detection
  bounce_data?: {
    bounce_type: "hard" | "soft";
    bounce_reason?: string;
    smtp_code?: string;
  };
  complaint_data?: {
    complaint_type?: string;
    feedback?: string;
  };
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: BadLeadDetectionRequest = await req.json();

    const { workspace_id, email, text, behavior, bounce_data, complaint_data } = body;

    if (!workspace_id || !email) {
      return new Response(
        JSON.stringify({ error: "workspace_id and email are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const detectedCategories: string[] = [];
    const reasons: string[] = [];

    // 1. Check for hard bounce
    if (bounce_data?.bounce_type === "hard") {
      detectedCategories.push("hard_bounce");
      reasons.push(bounce_data.bounce_reason || "Hard bounce detected");
    }

    // 2. Check for spam complaint
    if (complaint_data) {
      detectedCategories.push("spam_complaint");
      reasons.push(complaint_data.feedback || "Spam complaint detected");
    }

    // 3. Check for not-interested (if text provided)
    if (text) {
      const { data: isNotInterested, error: niError } = await supabase.rpc(
        "detect_not_interested",
        { p_text: text }
      );

      if (!niError && isNotInterested) {
        detectedCategories.push("not_interested");
        reasons.push("Not interested detected from reply text");
      }
    }

    // 4. Check for time waster (if text or behavior provided)
    if (text || behavior) {
      const { data: timeWasterResult, error: twError } = await supabase.rpc(
        "detect_time_waster",
        {
          p_text: text || null,
          p_behavior: behavior || {},
        }
      );

      if (!twError && timeWasterResult?.is_time_waster) {
        detectedCategories.push("time_waster");
        reasons.push(
          `Time waster detected: ${timeWasterResult.categories?.join(", ") || "general"}`
        );
      }
    }

    // 5. Check for disposable email
    const emailDomain = email.split("@")[1]?.toLowerCase();
    const { data: isDisposable } = await supabase.rpc("is_disposable_email", {
      p_email: email,
    });

    if (isDisposable) {
      detectedCategories.push("disposable_email");
      reasons.push("Disposable email domain detected");
    }

    // Create bad lead records for each detected category
    const createdBadLeads = [];

    for (const category of detectedCategories) {
      const reason = reasons[detectedCategories.indexOf(category)] || category;

      const { data: badLeadId, error: createError } = await supabase.rpc(
        "detect_bad_lead",
        {
          p_workspace_id: workspace_id,
          p_email: email,
          p_category: category,
          p_reason: reason,
          p_lead_id: null,
          p_campaign_id: null,
          p_metadata: {
            detected_by: "badleads-detect-worker",
            bounce_data: bounce_data || null,
            complaint_data: complaint_data || null,
            text_snippet: text ? text.substring(0, 200) : null,
          },
        }
      );

      if (!createError && badLeadId) {
        createdBadLeads.push({
          category,
          bad_lead_id: badLeadId,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        detected_categories: detectedCategories,
        created_bad_leads: createdBadLeads,
        message: `Detected ${detectedCategories.length} bad lead category(ies)`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Bad leads detect error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});





















































