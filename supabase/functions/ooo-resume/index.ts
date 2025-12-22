import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!supabaseUrl || !serviceKey || !anonKey) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  try {
    const {
      owner_id,
      ooo_event_id,
      label = "no_response",
      role_hint,
      region,
      prospect_tz,
      thread_summary,
    } = await req.json();

    if (!owner_id || !ooo_event_id || !prospect_tz) {
      return new Response(JSON.stringify({ ok: false, error: "Missing params" }), { status: 400 });
    }

    const { data: evt, error: evtError } = await supabase
      .from("ooo_events")
      .select("*")
      .eq("id", ooo_event_id)
      .eq("owner_id", owner_id)
      .single();

    if (evtError || !evt) {
      return new Response(JSON.stringify({ ok: false, error: "OOO event not found" }), { status: 404 });
    }

    const resumeBase = evt.parsed_return_at ?? evt.scheduled_followup_at ?? evt.created_at;
    if (!resumeBase) {
      return new Response(JSON.stringify({ ok: false, error: "Event missing resume timestamp" }), { status: 409 });
    }

    const timingResponse = await fetch(`${supabaseUrl}/functions/v1/timing-pick`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner_id,
        label,
        role_hint,
        region,
        prospect_tz,
        last_touch_at: resumeBase,
      }),
    });

    if (!timingResponse.ok) {
      const text = await timingResponse.text();
      throw new Error(`timing-pick failed: ${text}`);
    }

    const timingPayload = await timingResponse.json();
    if (!timingPayload?.run_at_utc) {
      throw new Error("timing-pick missing run_at_utc");
    }

    const nudgeResponse = await fetch(`${supabaseUrl}/functions/v1/nudge-generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner_id,
        campaign_id: evt.campaign_id,
        label,
        thread_summary,
      }),
    });

    if (!nudgeResponse.ok) {
      const text = await nudgeResponse.text();
      throw new Error(`nudge-generate failed: ${text}`);
    }

    const nudgePayload = await nudgeResponse.json();
    if (!nudgePayload?.draft || !nudgePayload?.event_id) {
      throw new Error("nudge-generate missing draft or event_id");
    }

    const delegateLine = "If there’s a better contact while you’re out, happy to loop them in.";
    let body: string = nudgePayload.draft;
    if (mentionsDelegate(evt.raw_text) && !body.includes(delegateLine)) {
      body = `${body.trimEnd()}\n\n${delegateLine}\n`;
    }

    const { error: queueError } = await supabase.from("send_queue").insert([
      {
        owner_id,
        campaign_id: evt.campaign_id,
        thread_id: evt.thread_id,
        event_id: nudgePayload.event_id,
        body,
        subject: null,
        run_at: timingPayload.run_at_utc,
      },
    ]);

    if (queueError) {
      throw queueError;
    }

    const { error: threadError } = await supabase
      .from("threads")
      .update({ is_paused: false, paused_reason: null })
      .eq("id", evt.thread_id);

    if (threadError) {
      throw threadError;
    }

    const { error: eventUpdateError } = await supabase
      .from("ooo_events")
      .update({
        status: "scheduled",
        scheduled_followup_at: timingPayload.run_at_utc,
      })
      .eq("id", ooo_event_id);

    if (eventUpdateError) {
      throw eventUpdateError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        run_at_utc: timingPayload.run_at_utc,
        event_id: nudgePayload.event_id,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("ooo-resume failure", error);
    return new Response(JSON.stringify({ ok: false, error: String(error?.message ?? error) }), { status: 500 });
  }
});

function mentionsDelegate(text: string): boolean {
  const lowered = text.toLowerCase();
  const delegatePatterns = [
    /contact\s+(?:my|our)?\s*(?:colleague|coworker|associate|team)/i,
    /reach\s+out\s+to\s+[a-z]+(?:\s+[a-z]+){1,2}@?/i,
    /email\s+(?:my|our)?\s*(?:assistant|team)/i,
    /(?:while\s+i'm\s+out|during\s+my\s+absence).*?(?:contact|reach out)/i,
  ];
  return delegatePatterns.some((pattern) => pattern.test(lowered));
}


