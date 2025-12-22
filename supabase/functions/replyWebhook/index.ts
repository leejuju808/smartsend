import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const payload = await req.json();
    const { thread_id, from_email, subject, body_text, body } = payload;

    // Step 1 — Lookup lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, campaign_id, status")
      .eq("thread_id", thread_id)
      .single();

    if (leadError || !lead) {
      throw new Error("Lead not found");
    }

    // Step 2 — Update lead status + cancel queued sends
    // also set last_reply_* so Inbox shows context
    const snippet = (body_text ?? body ?? subject ?? "").slice(0, 240);
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        status: "replied",
        last_reply_at: new Date().toISOString(),
        last_reply_snippet: snippet,
      })
      .eq("id", lead.id);

    if (updateError) throw updateError;

    await supabase
      .from("send_queue")
      .update({ status: "canceled" })
      .eq("lead_id", lead.id)
      .in("status", ["queued", "scheduled"]);

    // Step 3 — Log event
    await supabase.from("campaign_logs").insert({
      campaign_id: lead.campaign_id,
      lead_id: lead.id,
      type: "reply_webhook",
      message: `Detected reply from ${from_email} - ${subject}`,
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, lead_id: lead.id }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500 }
    );
  }
});

