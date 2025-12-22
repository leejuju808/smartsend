// supabase/functions/email-webhook/index.ts
// This Edge Function receives webhook events for email tracking
// and logs them to the email_logs table for dashboard analytics

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // CORS headers for cross-origin requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const event = await req.json();
    const { email, status, campaign_id, lead_id, email_log_id } = event;

    // Validate required fields
    if (!status || !["sent", "delivered", "opened", "replied"].includes(status)) {
      return new Response(
        JSON.stringify({ error: "Invalid status. Must be one of: sent, delivered, opened, replied" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // If email_log_id is provided, update existing record
    if (email_log_id) {
      const { error } = await supabase
        .from("email_logs")
        .update({
          status,
          timestamp: new Date().toISOString(),
        })
        .eq("id", email_log_id);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, updated: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Otherwise, insert new record
    const insertData: any = {
      status,
      campaign_id: campaign_id || null,
      lead_id: lead_id || null,
      to_email: email || "",
      subject: event.subject || "",
      timestamp: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("email_logs")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});