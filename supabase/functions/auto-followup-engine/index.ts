import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { leadId, campaignId } = await req.json();

    if (!leadId || !campaignId) {
      return new Response(
        JSON.stringify({ error: "leadId and campaignId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if last email is replied
    // Find the most recent email sent to this lead in this campaign
    const { data: lastEmail } = await supabase
      .from("email_logs")
      .select("*")
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check if last email has a reply with ai_reply_status = "replied"
    if (lastEmail) {
      const { data: reply } = await supabase
        .from("email_replies")
        .select("ai_reply_status")
        .eq("email_log_id", lastEmail.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reply?.ai_reply_status === "replied") {
        return new Response(
          JSON.stringify({ message: "Lead already replied, skip follow-up." }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Get sequence_order from last sent email, default to 1 if not set
    const lastSequenceOrder = lastEmail?.sequence_order || 1;

    // Find next follow-up template
    const { data: nextTemplate } = await supabase
      .from("campaign_emails")
      .select("*")
      .eq("campaign_id", campaignId)
      .gt("sequence_order", lastSequenceOrder)
      .order("sequence_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!nextTemplate) {
      return new Response(
        JSON.stringify({ message: "No more follow-ups." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Queue follow-up email
    // Note: Adjust field names based on your actual send_queue schema
    const queueData: any = {
      lead_id: leadId,
      campaign_id: campaignId,
      subject: nextTemplate.subject,
      body: nextTemplate.body,
      status: "queued",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(), // +1 day
    };

    // Add body_html if send_queue expects it
    if (nextTemplate.body_html) {
      queueData.body_html = nextTemplate.body_html;
    } else {
      queueData.body_html = nextTemplate.body;
    }

    const { error: queueError } = await supabase.from("send_queue").insert(queueData);

    if (queueError) {
      console.error("Error queueing follow-up:", queueError);
      return new Response(
        JSON.stringify({ error: queueError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

