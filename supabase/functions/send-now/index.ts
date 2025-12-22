import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USAGE_BUMP_URL = Deno.env.get("USAGE_BUMP_URL")!;
const SEND_TICK_URL = Deno.env.get("SEND_TICK_URL")!;

function clampToWindow(startUtc: Date, endUtc: Date, jitterSec = 0): string {
  const start = startUtc.getTime();
  const end = endUtc.getTime();
  const span = Math.max(0, end - start - 1000);
  const offset = Math.min(span, Math.max(0, jitterSec * 1000));
  return new Date(start + offset).toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const {
      campaign_id,
      lead_id,
      from_account_id,
      subject,
      body,
      provider = "gmail",
      step_no = 1,
      jitter_seconds = 0,
      thread_id,
      idempotency_key,
    } = await req.json();

    if (!campaign_id || !lead_id || !from_account_id) {
      return new Response("Missing params", { status: 400 });
    }

    const sb = createClient(SB_URL, SRK);

    const prev = await fetch(`${SB_URL}/functions/v1/schedule-preview`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${SRK}`,
      },
      body: JSON.stringify({ campaign_id, lead_id, n: 1 }),
    });

    if (!prev.ok) {
      return new Response(await prev.text(), { status: 500 });
    }

    const j = await prev.json();
    const win = j.windows?.[0];
    if (!win) {
      return new Response("No eligible send window", { status: 409 });
    }

    const run_at = clampToWindow(
      new Date(win.start_utc),
      new Date(win.end_utc),
      jitter_seconds,
    );

    const bump = await fetch(USAGE_BUMP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_id: from_account_id, amount: 1 }),
    });

    if (bump.status === 402) {
      return new Response(JSON.stringify({ error: "quota_exceeded" }), {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }

    if (!bump.ok) {
      return new Response(await bump.text(), { status: 500 });
    }

    const payload = {
      subject: subject ?? "Re: Quick follow-up",
      body: body ?? "",
      headers: {},
    };

    const { data, error } = await sb.rpc("enqueue_send_job", {
      p_campaign: campaign_id,
      p_lead: lead_id,
      p_from_account: from_account_id,
      p_step_no: step_no,
      p_run_at: run_at,
      p_payload: payload,
      p_provider: provider,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return new Response(
        JSON.stringify({ ok: false, blocked: "suppressed" }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    }

    if (thread_id || idempotency_key) {
      const updates: Record<string, unknown> = {};
      if (thread_id) updates.thread_id = thread_id;
      if (idempotency_key) updates.idempotency_key = idempotency_key;

      if (Object.keys(updates).length > 0) {
        const { error: queueUpdateError } = await sb
          .from("send_queue")
          .update(updates)
          .eq("id", data);

        if (queueUpdateError) {
          throw new Error(queueUpdateError.message);
        }
      }
    }

    await fetch(SEND_TICK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch_per_account: 10, account_ids: [from_account_id] }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({ ok: true, queue_id: data, run_at }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
});



