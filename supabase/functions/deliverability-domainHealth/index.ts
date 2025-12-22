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

  const { domain_settings_id } = payload;

  if (!domain_settings_id) {
    return new Response(JSON.stringify({ error: "domain_settings_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Calculate health score using database function
  const { data: healthScore, error: scoreError } = await supabase.rpc(
    "calculate_domain_health_score",
    { p_domain_settings_id: domain_settings_id }
  );

  if (scoreError) {
    return new Response(JSON.stringify({ error: scoreError.message }), {
      status: 500,
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

  // Get bounce and complaint stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: bounces, error: bounceError } = await supabase
    .from("bounce_events")
    .select("bounce_type, created_at")
    .eq("workspace_id", domainSettings.org_id)
    .gte("created_at", thirtyDaysAgo.toISOString());

  const { data: complaints, error: complaintError } = await supabase
    .from("complaint_events")
    .select("created_at")
    .eq("workspace_id", domainSettings.org_id)
    .gte("created_at", thirtyDaysAgo.toISOString());

  // Calculate rates
  const totalBounces = bounces?.length || 0;
  const hardBounces = bounces?.filter((b) => b.bounce_type === "hard").length || 0;
  const bounceRate = totalBounces > 0 ? (hardBounces / totalBounces) * 100 : 0;
  const complaintCount = complaints?.length || 0;

  // Get email send count for complaint rate
  const { count: emailCount } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .eq("org_id", domainSettings.org_id)
    .gte("created_at", thirtyDaysAgo.toISOString());

  const complaintRate = emailCount && emailCount > 0 ? (complaintCount / emailCount) * 100 : 0;

  // Determine status
  let status = "active";
  let statusLabel = "Excellent";
  
  if (healthScore >= 80) {
    statusLabel = "Excellent";
  } else if (healthScore >= 60) {
    statusLabel = "Safe";
  } else if (healthScore >= 30) {
    statusLabel = "Risky";
    status = "paused";
  } else {
    statusLabel = "Dangerous";
    status = "blocked";
  }

  // Update domain_health table
  const { error: updateError } = await supabase
    .from("domain_health")
    .upsert({
      domain_settings_id,
      org_id: domainSettings.org_id,
      health_score: healthScore,
      bounce_rate: bounceRate,
      complaint_rate: complaintRate,
      dkim_valid: domainSettings.dkim_pass || false,
      spf_valid: domainSettings.spf_pass || false,
      dmarc_valid: domainSettings.dmarc_pass || false,
      last_calculated_at: new Date().toISOString(),
      status: status,
    }, {
      onConflict: "domain_settings_id",
    });

  if (updateError) {
    console.error("Error updating domain_health:", updateError);
  }

  // Log event
  await supabase.from("deliverability_events").insert({
    domain_settings_id,
    org_id: domainSettings.org_id,
    event_type: "health_calculated",
    severity: healthScore < 30 ? "critical" : healthScore < 60 ? "warning" : "info",
    message: `Domain health score calculated: ${healthScore.toFixed(1)} (${statusLabel})`,
    event_data: {
      health_score: healthScore,
      bounce_rate: bounceRate,
      complaint_rate: complaintRate,
      status: statusLabel,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      health_score: parseFloat(healthScore.toFixed(2)),
      status: statusLabel,
      status_code: status,
      bounce_rate: parseFloat(bounceRate.toFixed(2)),
      complaint_rate: parseFloat(complaintRate.toFixed(2)),
      dns_status: {
        spf: domainSettings.spf_pass || false,
        dkim: domainSettings.dkim_pass || false,
        dmarc: domainSettings.dmarc_pass || false,
        mx: domainSettings.mx_pass || false,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
});





















































