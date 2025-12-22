import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.21.0/mod.ts";

serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

  try {
    const { emailId, body } = await req.json();

    const prompt = `Determine if this email is a reply from a lead. Reply with one word: "yes" or "no".\n\n${body}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const result = response.choices[0].message.content?.trim().toLowerCase();

    await supabase
      .from("email_replies")
      .update({ ai_reply_status: result === "yes" ? "replied" : "not_replied" })
      .eq("id", emailId);

    // Log "replied" event to email_events if it's a reply
    if (result === "yes") {
      // Get email_logs to find the original email
      const { data: emailReply } = await supabase
        .from("email_replies")
        .select("email_log_id")
        .eq("id", emailId)
        .maybeSingle();

      if (emailReply?.email_log_id) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id, campaign_id")
          .eq("id", emailReply.email_log_id)
          .maybeSingle();

        if (emailLog?.lead_id) {
          // Find the corresponding email record
          const { data: emailRecord } = await supabase
            .from("emails")
            .select("id")
            .eq("lead_id", emailLog.lead_id)
            .eq("campaign_id", emailLog.campaign_id || null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (emailRecord?.id) {
            await supabase.from("email_events").insert({
              email_id: emailRecord.id,
              lead_id: emailLog.lead_id,
              campaign_id: emailLog.campaign_id || null,
              event_type: "replied",
              meta: { source: "ai" }
            }).catch((err: any) => {
              console.error("Failed to log replied event:", err);
            });
          }
        }
      }
    }

    // Trigger auto-followup engine if not replied
    if (result === "no" || result !== "yes") {
      try {
        // Get lead_id and campaign_id from email_replies -> email_logs
        const { data: emailReply } = await supabase
          .from("email_replies")
          .select(`
            email_log_id,
            email_logs:email_log_id (
              lead_id,
              campaign_id
            )
          `)
          .eq("id", emailId)
          .maybeSingle();

        // Extract lead_id and campaign_id from the nested structure
        // Note: Supabase returns nested data differently, so we need to handle this
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id, campaign_id")
          .eq("id", emailReply?.email_log_id)
          .maybeSingle();

        if (emailLog?.lead_id && emailLog?.campaign_id) {
          // Trigger auto-followup engine
          const followupUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/auto-followup-engine`;
          await fetch(followupUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
            },
            body: JSON.stringify({
              leadId: emailLog.lead_id,
              campaignId: emailLog.campaign_id
            })
          });
        }
      } catch (e) {
        console.error("Failed to trigger auto-followup engine:", e);
        // Don't fail the request if follow-up trigger fails
      }
    }

    return new Response(JSON.stringify({ success: true, status: result }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
});