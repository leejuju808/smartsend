import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const SECRET = Deno.env.get("BOUNCE_SECRET")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-ss-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const body = await req.json(); // { senderEmail, leadId, campaignId, reason, type }
    const { senderEmail, leadId, campaignId, reason, type } = body;

    if (!senderEmail || !type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: senderEmail, type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find sender profile by email
    const { data: sender, error: senderErr } = await supabase
      .from("sender_profiles")
      .select("id, user_id")
      .eq("email", senderEmail)
      .maybeSingle();

    if (senderErr) {
      return new Response(
        JSON.stringify({ error: `Failed to find sender: ${senderErr.message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!sender) {
      return new Response("unknown sender", { status: 404 });
    }

    // Insert bounce log
    const { error: bounceErr } = await supabase
      .from("bounce_logs")
      .insert({
        sender_id: sender.id,
        campaign_id: campaignId || null,
        lead_id: leadId || null,
        reason: reason || null,
        type: type,
      });

    if (bounceErr) {
      return new Response(
        JSON.stringify({ error: `Failed to log bounce: ${bounceErr.message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update bounce_rate + health via RPC function
    const { error: healthErr } = await supabase.rpc("update_sender_health", {
      p_sender_id: sender.id,
    });

    if (healthErr) {
      console.error("Failed to update sender health:", healthErr);
      // Don't fail the request if health update fails
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});






