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

  const { domain_settings_id, action } = payload;

  if (!domain_settings_id) {
    return new Response(JSON.stringify({ error: "domain_settings_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Get warmup state
  const { data: warmupState, error: wsError } = await supabase
    .from("domain_warmup_state")
    .select("*")
    .eq("domain_settings_id", domain_settings_id)
    .single();

  if (wsError || !warmupState) {
    return new Response(JSON.stringify({ error: "Warmup state not found" }), {
      status: 404,
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

  // Handle actions
  if (action === "increment") {
    // Increment sent count
    const today = new Date().toISOString().split("T")[0];
    const lastSentDate = warmupState.last_sent_at ? new Date(warmupState.last_sent_at).toISOString().split("T")[0] : null;

    let emailsSentToday = warmupState.emails_sent_today || 0;
    let warmupStage = warmupState.warmup_stage || 1;

    // Reset daily counter if new day
    if (lastSentDate !== today) {
      emailsSentToday = 0;
      
      // Advance to next stage if limit reached yesterday
      if (warmupState.emails_sent_today >= warmupState.current_daily_limit && warmupState.warmup_stage < 9) {
        warmupStage = warmupState.warmup_stage + 1;
        
        // Update daily limit based on schedule
        const schedule = warmupState.warmup_schedule || [];
        const nextDaySchedule = schedule.find((s: any) => s.day === warmupStage);
        const newLimit = nextDaySchedule?.limit || Math.min(warmupState.current_daily_limit + 25, warmupState.target_daily_limit);
        
        await supabase
          .from("domain_warmup_state")
          .update({
            warmup_stage: warmupStage,
            current_daily_limit: newLimit,
            emails_sent_today: 1,
            emails_sent_total: (warmupState.emails_sent_total || 0) + 1,
            last_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", warmupState.id);

        // Log progress event
        await supabase.from("deliverability_events").insert({
          domain_settings_id,
          org_id: domainSettings.org_id,
          event_type: "warmup_progress",
          severity: "info",
          message: `Warmup advanced to day ${warmupStage}, daily limit: ${newLimit}`,
          event_data: {
            stage: warmupStage,
            daily_limit: newLimit,
          },
        });

        return new Response(
          JSON.stringify({
            ok: true,
            warmup_stage: warmupStage,
            current_daily_limit: newLimit,
            emails_sent_today: 1,
            emails_sent_total: (warmupState.emails_sent_total || 0) + 1,
            can_send: 1 < newLimit,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
    }

    // Increment counter
    emailsSentToday += 1;
    const emailsSentTotal = (warmupState.emails_sent_total || 0) + 1;

    await supabase
      .from("domain_warmup_state")
      .update({
        emails_sent_today: emailsSentToday,
        emails_sent_total: emailsSentTotal,
        last_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", warmupState.id);

    // Check if warmup complete
    if (warmupStage >= 6 && emailsSentTotal >= warmupState.target_daily_limit * 6) {
      await supabase
        .from("domain_warmup_state")
        .update({
          warmup_status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", warmupState.id);

      await supabase.from("deliverability_events").insert({
        domain_settings_id,
        org_id: domainSettings.org_id,
        event_type: "warmup_completed",
        severity: "info",
        message: "Domain warmup completed",
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        warmup_stage: warmupStage,
        current_daily_limit: warmupState.current_daily_limit,
        emails_sent_today: emailsSentToday,
        emails_sent_total: emailsSentTotal,
        can_send: emailsSentToday < warmupState.current_daily_limit,
        warmup_complete: warmupState.warmup_status === "completed",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } else if (action === "get") {
    // Just return current state
    return new Response(
      JSON.stringify({
        ok: true,
        warmup_stage: warmupState.warmup_stage,
        warmup_status: warmupState.warmup_status,
        current_daily_limit: warmupState.current_daily_limit,
        target_daily_limit: warmupState.target_daily_limit,
        emails_sent_today: warmupState.emails_sent_today || 0,
        emails_sent_total: warmupState.emails_sent_total || 0,
        can_send: (warmupState.emails_sent_today || 0) < warmupState.current_daily_limit,
        warmup_complete: warmupState.warmup_status === "completed",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } else if (action === "start") {
    // Start warmup
    await supabase
      .from("domain_warmup_state")
      .update({
        warmup_status: "warming",
        started_at: new Date().toISOString(),
      })
      .eq("id", warmupState.id);

    await supabase.from("deliverability_events").insert({
      domain_settings_id,
      org_id: domainSettings.org_id,
      event_type: "warmup_started",
      severity: "info",
      message: "Domain warmup started",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Warmup started",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
});





















































