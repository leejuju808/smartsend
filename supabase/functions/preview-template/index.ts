// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { campaign_id, lead_id, step_no, override_vars } = await req.json();

    if (!campaign_id || !lead_id || typeof step_no !== "number") {
      return new Response(
        JSON.stringify({ ok: false, error: "campaign_id, lead_id, step_no required" }),
        { status: 400 }
      );
    }

    // fetch step + campaign defaults + lead
    const [{ data: step, error: stepErr }, { data: camp, error: campErr }, { data: lead, error: leadErr }] = await Promise.all([
      supabase
        .from("campaign_steps")
        .select("id, subject_template, body_html_template")
        .eq("campaign_id", campaign_id)
        .eq("step_no", step_no)
        .single(),
      supabase
        .from("campaigns")
        .select("id, default_vars")
        .eq("id", campaign_id)
        .single(),
      supabase
        .from("leads")
        .select(
          "id, email, first_name, last_name, company, title, city, state, country, meta"
        )
        .eq("id", lead_id)
        .single(),
    ]);

    if (stepErr || campErr || leadErr) {
      return new Response(
        JSON.stringify({ ok: false, error: "Not found (step/campaign/lead)" }),
        { status: 404 }
      );
    }

    if (!step || !camp || !lead) {
      return new Response(
        JSON.stringify({ ok: false, error: "Not found (step/campaign/lead)" }),
        { status: 404 }
      );
    }

    // Build context via RPC so UNSUB_LINK logic stays consistent
    const { data: ctx, error: ctxErr } = await supabase.rpc("template_context_for_lead", {
      p_campaign: campaign_id,
      p_lead: lead_id,
    });
    if (ctxErr) throw ctxErr;

    // Optional overrides (UI “test variables”)
    const merged = { ...(ctx as any), ...(override_vars ?? {}) } as any;

    const [subjectRes, bodyRes, lintRes] = await Promise.all([
      supabase.rpc("render_template", {
        p_template: (step as any).subject_template ?? "",
        p_vars: merged,
      }),
      supabase.rpc("render_template", {
        p_template: (step as any).body_html_template ?? "",
        p_vars: merged,
      }),
      supabase.rpc("lint_template", {
        p_template: (step as any).body_html_template ?? "",
        p_vars: merged,
      }),
    ]);

    if (subjectRes.error) throw subjectRes.error;
    if (bodyRes.error) throw bodyRes.error;
    if (lintRes.error) throw lintRes.error;

    return new Response(
      JSON.stringify({
        ok: true,
        context: merged,
        subject: subjectRes.data,
        body_html: bodyRes.data,
        missing_vars: lintRes.data ?? [],
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});


