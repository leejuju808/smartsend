// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function parseOOOReturnDate(text: string): string | null {
  const m = text.match(
    /(?:back|return|available)\s+(?:on|by)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
  );
  return m ? new Date(m[1]).toISOString() : null;
}

function isHardBounce(code?: string, diag?: string): boolean {
  return !!(
    code?.startsWith("5.") ||
    /user unknown|no such user|mailbox unavailable/i.test(diag ?? "")
  );
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const payload = await req.json();
  const {
    lead_id,
    thread_id,
    provider,
    kind,
    subtype,
    raw,
    email,
    diagnostic,
    smtp_code,
    text,
  } = payload;

  const { data: ev, error: evErr } = await supabase
    .from("inbound_events")
    .insert({
      lead_id,
      thread_id,
      provider,
      kind,
      subtype,
      raw,
    })
    .select("id")
    .single();
  if (evErr) {
    return new Response(JSON.stringify({ error: evErr.message }), {
      status: 400,
    });
  }

  if (kind === "bounce") {
    const hard = subtype === "hard" || isHardBounce(smtp_code, diagnostic);

    if (hard) {
      await supabase.from("suppressions_email").upsert({
        email,
        reason: "hard_bounce",
        expires_at: null,
      });

      const { data: stats } = await supabase.rpc("domain_hard_bounce_count", {
        p_domain: email.split("@")[1],
      });
      if ((stats?.count ?? 0) >= 10) {
        await supabase.from("suppressions_domain").upsert({
          domain: email.split("@")[1],
          reason: "policy",
          expires_at: null,
        });
      }
    } else {
      await supabase.from("reverify_queue").insert({
        email,
        lead_id,
        status: "queued",
      });
    }

    await supabase.from("followup_state")
      .update({ is_done: true })
      .eq("lead_id", lead_id);
  }

  if (kind === "ooo" || kind === "vacation") {
    const iso =
      parseOOOReturnDate(text ?? diagnostic ?? "") ??
      new Date(Date.now() + 7 * 24 * 3600e3).toISOString();
    await supabase.from("ooo_schedules").upsert({
      thread_id,
      return_at: iso,
      detected_from_event: ev.id,
    });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});



