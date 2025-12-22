// Supabase Edge Function: reply-detection.ts
// MVP-Ready AI Reply Detection - Automatically detects if an incoming Gmail message is a real human reply
// Handles webhook from Google Apps Script (Gmail → SmartSend bridge)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Optional secret for additional security (set via env var)
const REPLY_WEBHOOK_SECRET = Deno.env.get("REPLY_WEBHOOK_SECRET");

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-ss-secret",
        },
      });
    }

    // Check secret if configured (optional security hardening)
    if (REPLY_WEBHOOK_SECRET) {
      const secretHeader = req.headers.get("x-ss-secret");
      if (!secretHeader || secretHeader !== REPLY_WEBHOOK_SECRET) {
        return new Response(
          JSON.stringify({ ok: false, error: "unauthorized" }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // Parse request body
    const { leadId, emailSnippet } = await req.json();

    // Validate required fields
    if (!leadId || !emailSnippet) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: leadId and emailSnippet" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Run AI classification
    const prompt = `Decide if this email is a genuine human reply to a cold email. Reply "true" or "false" only.\n\n${emailSnippet}`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1, // Lower temperature for more consistent classification
      max_tokens: 10, // We only need "true" or "false"
    });

    const aiResponse = response.choices[0].message.content?.trim().toLowerCase() || "";
    const isReply = aiResponse.includes("true");

    // Update Supabase campaign_leads table - mark as replied if AI confirms it's a reply
    if (isReply) {
      // Find campaign_leads entries for this lead_id
      const { data: campaignLeads, error: findError } = await supabase
        .from("campaign_leads")
        .select("id, campaign_id")
        .eq("lead_id", leadId);

      if (findError) {
        console.error("Error finding campaign_leads:", findError);
      } else if (campaignLeads && campaignLeads.length > 0) {
        // Update all campaign_leads entries for this lead
        const { error: updateError } = await supabase
          .from("campaign_leads")
          .update({ 
            has_replied: true,
            replied: true, // Also set replied if column exists
            replied_at: new Date().toISOString(),
          })
          .eq("lead_id", leadId);

        if (updateError) {
          console.error("Error updating campaign_leads:", updateError);
          // Continue anyway - we'll still log the detection
        }
      }

      // Also update leads table for consistency
      const { error: leadUpdateError } = await supabase
        .from("leads")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      if (leadUpdateError) {
        console.error("Error updating leads:", leadUpdateError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, isReply, leadId }),
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      }
    );
  } catch (error: any) {
    console.error("reply-detection error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        message: error?.message || "Unknown error" 
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});
