// Block 17400 — SmartSend Insurance Engine v1
// Insurance Detection Worker
// Scans messages, PDFs, attachments for insurance keywords and auto-applies detection

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
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
    const now = new Date().toISOString();

    console.log(`[Insurance Detection] Starting run at ${now}`);

    // Get request body if POST
    let body: any = null;
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        // Body is optional
      }
    }

    const contactId = body?.contact_id || null;
    const workspaceId = body?.workspace_id || null;

    let processed = 0;
    let detected = 0;
    let errors = 0;

    if (contactId) {
      // Process single contact
      console.log(`[Insurance Detection] Processing contact ${contactId}`);
      
      try {
        // Get recent messages for this contact
        const { data: messages, error: messagesError } = await supabase
          .from("inbox_threads")
          .select("id, body, created_at")
          .eq("contact_id", contactId)
          .eq("is_reply", true)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(10);

        if (messagesError) {
          throw messagesError;
        }

        // Check for insurance keywords in messages
        let hasInsurance = false;
        let detectedKeywords: string[] = [];
        let maxConfidence = 0;

        if (messages && messages.length > 0) {
          const allText = messages.map((m) => m.body || "").join(" ");

          // Detect insurance keywords
          const { data: detectionResult, error: detectionError } = await supabase.rpc(
            "detect_insurance_keywords",
            {
              p_text: allText,
              p_attachments: "[]"::jsonb,
            }
          );

          if (!detectionError && detectionResult) {
            hasInsurance = (detectionResult as any).has_insurance || false;
            detectedKeywords = (detectionResult as any).detected_keywords || [];
            maxConfidence = (detectionResult as any).confidence || 0;
          }
        }

        // Check for insurance documents
        const { data: documents } = await supabase
          .from("insurance_documents")
          .select("id")
          .eq("contact_id", contactId)
          .limit(1);

        if (documents && documents.length > 0) {
          hasInsurance = true;
          maxConfidence = Math.max(maxConfidence, 0.7);
        }

        // If insurance detected, auto-apply
        if (hasInsurance) {
          const { error: applyError } = await supabase.rpc(
            "auto_apply_insurance_detection",
            {
              p_contact_id: contactId,
              p_detection_source: "message",
              p_detected_keywords: detectedKeywords,
              p_confidence: maxConfidence,
            }
          );

          if (applyError) {
            console.error(`[Insurance Detection] Error applying detection:`, applyError);
            errors++;
          } else {
            detected++;
            console.log(`[Insurance Detection] Insurance detected for contact ${contactId}`);
          }
        }

        processed++;
      } catch (error) {
        console.error(`[Insurance Detection] Error processing contact ${contactId}:`, error);
        errors++;
      }
    } else {
      // Process all contacts with recent activity (last 7 days)
      console.log(`[Insurance Detection] Processing all contacts with recent activity`);

      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("id, workspace_id, insurance_tagged")
        .eq("insurance_tagged", false)
        .not("workspace_id", "is", null)
        .limit(100); // Process in batches

      if (contactsError) {
        throw contactsError;
      }

      if (!contacts || contacts.length === 0) {
        console.log(`[Insurance Detection] No contacts to process`);
        return new Response(
          JSON.stringify({
            ok: true,
            processed: 0,
            detected: 0,
            errors: 0,
            message: "No contacts to process",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process each contact
      for (const contact of contacts) {
        try {
          // Get recent messages
          const { data: messages } = await supabase
            .from("inbox_threads")
            .select("id, body, created_at")
            .eq("contact_id", contact.id)
            .eq("is_reply", true)
            .eq("direction", "inbound")
            .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(5);

          if (!messages || messages.length === 0) {
            continue; // Skip if no recent messages
          }

          const allText = messages.map((m) => m.body || "").join(" ");

          // Detect insurance keywords
          const { data: detectionResult } = await supabase.rpc(
            "detect_insurance_keywords",
            {
              p_text: allText,
              p_attachments: "[]"::jsonb,
            }
          );

          if (detectionResult && (detectionResult as any).has_insurance) {
            const detectedKeywords = (detectionResult as any).detected_keywords || [];
            const confidence = (detectionResult as any).confidence || 0.5;

            // Auto-apply insurance detection
            const { error: applyError } = await supabase.rpc(
              "auto_apply_insurance_detection",
              {
                p_contact_id: contact.id,
                p_detection_source: "message",
                p_detected_keywords: detectedKeywords,
                p_confidence: confidence,
              }
            );

            if (applyError) {
              console.error(`[Insurance Detection] Error applying detection for contact ${contact.id}:`, applyError);
              errors++;
            } else {
              detected++;
              console.log(`[Insurance Detection] Insurance detected for contact ${contact.id}`);
            }
          }

          processed++;
        } catch (error) {
          console.error(`[Insurance Detection] Error processing contact ${contact.id}:`, error);
          errors++;
        }
      }
    }

    // Check for risk alerts
    try {
      const { error: alertsError } = await supabase.rpc("check_insurance_risk_alerts", {
        p_contact_id: null, // Check all contacts
      });

      if (alertsError) {
        console.error(`[Insurance Detection] Error checking risk alerts:`, alertsError);
      }
    } catch (error) {
      console.error(`[Insurance Detection] Error checking risk alerts:`, error);
    }

    const result = {
      ok: true,
      processed,
      detected,
      errors,
      processed_at: now,
    };

    console.log(`[Insurance Detection] Completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Insurance Detection] Error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





















































