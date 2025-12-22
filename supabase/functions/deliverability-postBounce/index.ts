// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { domain_settings_id, bounce_type, email, bounce_reason, campaign_id, send_id } = payload;

  if (!domain_settings_id || !bounce_type || !email) {
    return new Response(JSON.stringify({ error: "domain_settings_id, bounce_type, and email are required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Get domain settings
  const { data: domainSettings, error: dsError } = await supabase
    .from("domain_settings")
    .select("*")
    .eq("id", domain_settings_id)
    .single();

  if (dsError || !domainSettings) {
    return new Response(JSON.stringify({ error: "Domain settings not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // Record bounce event (using existing bounce_events table from Block 13700)
  const { data: bounceEvent, error: bounceError } = await supabase
    .from("bounce_events")
    .insert({
      workspace_id: domainSettings.org_id,
      email: email.toLowerCase().trim(),
      bounce_type: bounce_type, // 'hard' or 'soft'
      bounce_reason: bounce_reason || null,
      campaign_id: campaign_id || null,
      send_id: send_id || null,
      raw_payload: payload,
    })
    .select()
    .single();

  if (bounceError) {
    console.error("Error recording bounce:", bounceError);
  }

  // Update domain health score
  const { error: healthError } = await supabase.rpc("calculate_domain_health_score", {
    p_domain_settings_id: domain_settings_id,
  });

  if (healthError) {
    console.error("Error updating health score:", healthError);
  }

  // Check if we need to auto-pause
  await supabase.rpc("auto_pause_domain_on_threshold", {
    p_domain_settings_id: domain_settings_id,
  });

  // Log deliverability event
  await supabase.from("deliverability_events").insert({
    domain_settings_id,
    org_id: domainSettings.org_id,
    event_type: "bounce_detected",
    severity: bounce_type === "hard" ? "error" : "warning",
    message: `${bounce_type} bounce detected for ${email}`,
    campaign_id: campaign_id || null,
    send_id: send_id || null,
    event_data: {
      bounce_type,
      email,
      bounce_reason,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      bounce_id: bounceEvent?.id,
      message: "Bounce processed successfully",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
});





















































