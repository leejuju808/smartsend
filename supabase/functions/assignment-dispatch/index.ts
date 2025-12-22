// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function slaStart(
  account_id: string,
  lead_id: string,
  reply_event_id: string | null,
  assigned_to: string,
  campaign_id?: string | null,
) {
  const { data: pol } = await sb.from("sla_policies")
    .select("*")
    .eq("account_id", account_id)
    .maybeSingle();

  const mins = pol?.first_response_minutes ?? 120;
  const reass = pol?.reassign_minutes ?? 480;
  const remindPlan = pol?.remind_minutes ?? [60, 120];

  const now = new Date();
  const due = new Date(now.getTime() + mins * 60 * 1000);
  const reassignAt = new Date(now.getTime() + reass * 60 * 1000);

  await sb.from("sla_timers").insert({
    account_id,
    lead_id,
    reply_event_id,
    assigned_to,
    due_at: due.toISOString(),
    reassign_at: reassignAt.toISOString(),
    remind_plan: remindPlan,
    reminded_at: [],
  });
}

serve(async (req) => {
  try {
    const { type, payload } = await req.json();

    if (type === "reply_created") {
      const {
        account_id,
        campaign_id,
        lead_id,
        reply_event_id,
        lead_email,
        raw_excerpt,
      } = payload;

      const { data: ass, error } = await sb.rpc("auto_assign", {
        p_account: account_id,
        p_lead: lead_id,
        p_campaign: campaign_id,
        p_reply_event: reply_event_id,
        p_lead_email: lead_email,
        p_excerpt: raw_excerpt ?? "",
      });

      if (error) {
        console.error("auto_assign failed", error);
        return new Response(
          JSON.stringify({ error: "ASSIGNMENT_FAILED" }),
          { status: 500 },
        );
      }

      if (ass) {
        await slaStart(
          account_id,
          lead_id,
          reply_event_id,
          ass as string,
          campaign_id,
        );
      }

      return new Response(
        JSON.stringify({ ok: true, assigned_to: ass ?? null }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (type === "lead_created") {
      const { account_id, campaign_id, lead_id, email } = payload;
      const { data: ass, error } = await sb.rpc("auto_assign", {
        p_account: account_id,
        p_lead: lead_id,
        p_campaign: campaign_id,
        p_reply_event: null,
        p_lead_email: email,
        p_excerpt: "",
      });

      if (error) {
        console.error("auto_assign failed", error);
        return new Response(
          JSON.stringify({ error: "ASSIGNMENT_FAILED" }),
          { status: 500 },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, assigned_to: ass ?? null }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "UNKNOWN_EVENT" }),
      { status: 400 },
    );
  } catch (e) {
    console.error("assignment-dispatch error", e);
    return new Response(
      JSON.stringify({ error: "SERVER_ERROR", detail: String(e) }),
      { status: 500 },
    );
  }
});

