// Block 21732 — SmartSend Roofing Reply Detection v1
// Edge Function — Inbound Email Webhook Handler
// 
// This function:
// 1. Receives inbound email webhooks from providers (Resend/SendGrid/Postmark/etc.)
// 2. Extracts lead_id from headers or reply-to address
// 3. Logs email_event as "reply"
// 4. Sends to AI classification (Block 21728)
// 5. Updates lead timestamps + intent + activity
// 6. Adds to unified timeline (Block 21727)
// 7. Recalculates heat score (Block 21730)
//
// Hook this up to your provider's inbound webhook endpoint.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

type ProviderPayload = {
  subject?: string;
  text?: string;
  html?: string;
  from?: string;
  to?: string | string[];
  headers?: Record<string, string>;
  in_reply_to?: string | null;
  message_id?: string;
  [key: string]: any; // Allow other provider-specific fields
};

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = (await req.json()) as ProviderPayload;

    // ========================================================================
    // STEP 1: Extract lead_id (header or reply-to email)
    // ========================================================================
    // We assume:
    // - Outgoing emails include a custom header: X-SmartSend-Lead-ID: <uuid>
    // - OR we embed a lead token in the reply-to address: reply+<lead_id>@smartsendhq.com
    // ========================================================================

    let leadId: string | null = null;

    // Try header first
    if (payload.headers?.["x-smartsend-lead-id"]) {
      leadId = payload.headers["x-smartsend-lead-id"];
    } else if (payload.headers?.["X-SmartSend-Lead-ID"]) {
      // Case-insensitive fallback
      leadId = payload.headers["X-SmartSend-Lead-ID"];
    }

    // Try reply-to email parsing if header not found
    if (!leadId && payload.to) {
      const toEmails = Array.isArray(payload.to) ? payload.to : [payload.to];
      
      for (const toEmail of toEmails) {
        // Pattern: reply+<lead_id>@smartsendhq.com
        const match = toEmail.match(/reply\+([a-f0-9-]{36})@/i);
        if (match) {
          leadId = match[1];
          break;
        }
      }
    }

    // If still no lead_id, try to find by from email
    if (!leadId && payload.from) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .ilike("email", payload.from)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lead) {
        leadId = lead.id;
      }
    }

    if (!leadId) {
      console.error("No lead_id found on inbound email", {
        from: payload.from,
        to: payload.to,
        headers: payload.headers,
      });
      // Return 200 to prevent webhook retries
      return new Response("No lead id", { status: 200 });
    }

    // ========================================================================
    // STEP 2: Extract reply text
    // ========================================================================

    const replyText =
      payload.text ||
      (payload.html
        ? payload.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000)
        : "");

    if (!replyText) {
      console.warn("No reply text found in payload");
      return new Response("No reply text", { status: 200 });
    }

    // ========================================================================
    // STEP 3: Log email_event as "reply"
    // ========================================================================

    const { data: eventData, error: insertErr } = await supabase
      .from("email_events")
      .insert({
        lead_id: leadId,
        event_type: "reply",
        provider_message_id: payload.message_id || null,
        payload: {
          from: payload.from,
          to: payload.to,
          subject: payload.subject,
          in_reply_to: payload.in_reply_to,
          // Store full payload but limit size
          ...(payload.message_id ? { message_id: payload.message_id } : {}),
        },
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Error inserting email_event:", insertErr);
      // Continue anyway - don't fail the whole request
    }

    // ========================================================================
    // STEP 4: Send to AI classification + status brain (Block 21728)
    // ========================================================================

    const aiClassifyUrl = Deno.env.get("AI_CLASSIFY_LEAD_URL") || 
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-classify-lead`;

    let intent = "warm"; // Default fallback

    try {
      const classifyRes = await fetch(aiClassifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          lead_id: leadId,
          reply_text: replyText,
        }),
      });

      if (classifyRes.ok) {
        const classifyData = await classifyRes.json();
        intent = classifyData?.new_status || classifyData?.intent || "warm";
        
        // Ensure intent is one of the valid values
        if (!["hot", "warm", "cold"].includes(intent)) {
          intent = "warm";
        }
      } else {
        console.error("AI classification failed:", await classifyRes.text());
      }
    } catch (classifyError) {
      console.error("Error calling AI classification:", classifyError);
      // Continue with default intent
    }

    // ========================================================================
    // STEP 5: Update lead timestamps + last_reply_intent + last_activity_at
    // ========================================================================

    const now = new Date().toISOString();

    const { error: updErr } = await supabase
      .from("leads")
      .update({
        last_reply_at: now,
        last_reply_intent: intent,
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", leadId);

    if (updErr) {
      console.error("Error updating lead:", updErr);
      // Continue anyway
    }

    // ========================================================================
    // STEP 6: Add to unified timeline (Block 21727)
    // ========================================================================

    const addEventUrl = Deno.env.get("ADD_LEAD_EVENT_URL") ||
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/add-lead-event`;

    try {
      await fetch(addEventUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          lead_id: leadId,
          event_type: "reply_received",
          event_subtype: `ai_${intent}`,
          message: `Homeowner replied (${intent.toUpperCase()})`,
          metadata: {
            from: payload.from,
            subject: payload.subject,
            snippet: replyText.slice(0, 280),
            provider_message_id: payload.message_id,
          },
        }),
      });
    } catch (eventErr) {
      console.error("Error adding timeline event:", eventErr);
      // Fallback: insert directly
      await supabase.from("lead_timeline_events").insert({
        lead_id: leadId,
        event_type: "reply_received",
        event_subtype: `ai_${intent}`,
        message: `Homeowner replied (${intent.toUpperCase()})`,
        metadata: {
          from: payload.from,
          subject: payload.subject,
          snippet: replyText.slice(0, 280),
        },
      }).catch((err) => console.error("Fallback timeline insert failed:", err));
    }

    // ========================================================================
    // STEP 7: AI Scheduling Detection + Auto-Appointment Creation (Block 21736)
    // ========================================================================
    // If reply is classified as HOT, check for scheduling intent and auto-create appointment

    if (intent === "hot") {
      try {
        const aiSchedulingUrl = Deno.env.get("AI_SCHEDULING_URL") ||
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-detect-scheduling`;

        const schedRes = await fetch(aiSchedulingUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            reply_text: replyText,
            lead_id: leadId,
          }),
        });

        if (schedRes.ok) {
          const schedData = await schedRes.json();
          
          if (schedData.wants_appointment) {
            // Determine appointment datetime
            let appointmentDatetime: string;
            
            if (schedData.proposed_time) {
              // Use AI-detected time
              appointmentDatetime = schedData.proposed_time;
            } else {
              // Default: 2 days from now at 10 AM local (convert to UTC)
              const defaultDate = new Date();
              defaultDate.setDate(defaultDate.getDate() + 2);
              defaultDate.setHours(10, 0, 0, 0);
              appointmentDatetime = defaultDate.toISOString();
            }

            // Create appointment via RPC
            const { data: appointmentId, error: apptError } = await supabase.rpc(
              "create_appointment",
              {
                p_lead_id: leadId,
                p_datetime: appointmentDatetime,
                p_source: "ai_hot_reply",
                p_notes: schedData.notes || `Auto-created from reply: ${replyText.slice(0, 100)}`,
              }
            );

            if (apptError) {
              console.error("Error creating appointment:", apptError);
            } else {
              console.log("Auto-created appointment:", appointmentId);
            }
          }
        } else {
          console.error("AI scheduling detection failed:", await schedRes.text());
        }
      } catch (schedError) {
        console.error("Error detecting scheduling intent:", schedError);
        // Continue anyway - don't fail the whole request
      }
    }

    // ========================================================================
    // STEP 8: Recalculate heat score (Block 21730)
    // ========================================================================

    try {
      await supabase.rpc("update_lead_heat_score", {
        p_lead_id: leadId,
      });
    } catch (heatErr) {
      console.error("Error recalculating heat score:", heatErr);
      // Continue anyway
    }

    // ========================================================================
    // STEP 9: Insert into email_messages table (optional v1)
    // ========================================================================

    try {
      await supabase.from("email_messages").insert({
        lead_id: leadId,
        campaign_id: null, // Could be extracted from headers if needed
        provider_message_id: payload.message_id || null,
        subject: payload.subject || "",
        direction: "inbound",
        body: replyText,
        from_email: payload.from || "",
        to_email: Array.isArray(payload.to) ? payload.to[0] : payload.to || "",
      });
    } catch (msgErr) {
      console.error("Error inserting email_message:", msgErr);
      // Continue anyway - this is optional
    }

    // ========================================================================
    // STEP 10: (Optional v1) Cancel no-reply follow-ups for this lead
    // ========================================================================
    // This could be done via RPC if you have a follow-up cancellation function
    // For now, we'll skip this as it's optional

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId,
        intent,
        message: "Reply processed successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error in email-inbound:", error);
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

