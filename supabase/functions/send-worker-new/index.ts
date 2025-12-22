// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BASE = Deno.env.get("APP_URL")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

// Pick provider based on connected accounts; fallback to whichever exists
async function resolveProvider(org_id: string) {
  const [{ data: g }, { data: o }] = await Promise.all([
    supabase.from("gmail_accounts").select("email, access_token").eq("org_id", org_id).maybeSingle(),
    supabase.from("outlook_accounts").select("email, access_token").eq("org_id", org_id).maybeSingle()
  ]);
  if (g) return { name: "gmail", meta: g };
  if (o) return { name: "outlook", meta: o };
  return { name: null as any, meta: null };
}

// naive throttle: count logs in last minute/hour
async function canSend(org_id: string) {
  const { data: lim } = await supabase.from("send_limits").select("*").eq("org_id", org_id).maybeSingle();
  const perMin = lim?.per_minute ?? 12;
  const perHour = lim?.per_hour ?? 100;

  const now = new Date();
  const minAgo = new Date(now.getTime() - 60_000).toISOString();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();

  const [{ count: cMin }, { count: cHour }] = await Promise.all([
    supabase.from("send_logs").select("*", { count: "exact", head: true })
      .eq("org_id", org_id).gte("created_at", minAgo),
    supabase.from("send_logs").select("*", { count: "exact", head: true })
      .eq("org_id", org_id).gte("created_at", hourAgo),
  ]);

  return (cMin ?? 0) < perMin && (cHour ?? 0) < perHour;
}

function mergeTemplate(t: string, vars: Record<string,string>) {
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

async function loadLeadVars(lead_id: string) {
  const { data } = await supabase.from("leads").select("name, first_name, last_name, company, email").eq("id", lead_id).single();
  const n = data?.name ?? "";
  return {
    first_name: data?.first_name ?? n.split(" ")[0] ?? "",
    last_name: data?.last_name ?? n.split(" ").slice(1).join(" ") ?? "",
    name: n ?? "",
    company: data?.company ?? "",
    email: data?.email ?? ""
  };
}

async function sendViaAdapter(orgId: string, to: string, subject: string, body: string, provider: "gmail" | "outlook" | "auto") {
  const endpoint = `${BASE}/api/mail/send`;
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ orgId, to, subject, body, provider })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "send failed");
  return j;
}

serve(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Pick up to N ready jobs
  const { data: jobs } = await supabase
    .from("send_queue")
    .select("*")
    .eq("state","queued")
    .lte("schedule_at", new Date().toISOString())
    .order("schedule_at", { ascending: true })
    .limit(20);

  if (!jobs?.length) return new Response("ok");

  for (const job of jobs) {
    try {
      // Check if campaign-contact is paused or has replied
      if (job.campaign_id && job.contact_id) {
        const { data: cc } = await supabase
          .from("campaign_contacts")
          .select("is_paused, pause_reason, pause_until, replied_at, stop_reason")
          .eq("campaign_id", job.campaign_id)
          .eq("contact_id", job.contact_id)
          .maybeSingle();

        if (cc?.is_paused) {
          // mark pending row as paused and bail out
          await supabase.from("send_queue")
            .update({ 
              paused_at: new Date().toISOString(), 
              pause_reason: cc.pause_reason 
            })
            .eq("id", job.id);
          continue;
        }

        // Step 4: Queue guard - stop if replied
        if (cc?.replied_at || cc?.stop_reason) {
          // mark as canceled and bail out
          await supabase.from("send_queue")
            .update({ 
              canceled_at: new Date().toISOString(), 
              cancel_reason: cc.stop_reason ?? 'replied' 
            })
            .eq("id", job.id);
          continue;
        }
      }

      // guard throttles
      const ok = await canSend(job.org_id);
      if (!ok) continue;

      // resolve provider if not preset
      let provider = job.provider as any;
      if (!provider || provider === "auto") {
        const p = await resolveProvider(job.org_id);
        if (!p.name) throw new Error("No provider connected");
        provider = p.name;
      }

      // optimistic lock to prevent races
      const { error: updErr } = await supabase
        .from("send_queue")
        .update({ state: "sending", attempts: job.attempts + 1 })
        .eq("id", job.id)
        .eq("state", "queued");
      if (updErr) throw updErr;

      // merge template
      const vars = await loadLeadVars(job.lead_id);
      const subj = mergeTemplate(job.subject, vars);
      const body = mergeTemplate(job.body, vars);

      // send through unified adapter (Next API)
      await sendViaAdapter(job.org_id, job.to_email, subj, body, provider);

      await supabase.from("send_queue").update({ state: "sent" }).eq("id", job.id);
      await supabase.from("send_logs").insert({
        queue_id: job.id, org_id: job.org_id, campaign_id: job.campaign_id,
        lead_id: job.lead_id, provider, status: "sent"
      });

      // optional: set lead status -> "Contacted"
      await supabase.from("leads").update({ status: "Contacted" }).eq("id", job.lead_id);

    } catch (e: any) {
      const err = String(e?.message ?? e);
      await supabase.from("send_queue").update({
        state: job.attempts + 1 >= 3 ? "failed" : "queued",
        last_error: err
      }).eq("id", job.id);
      await supabase.from("send_logs").insert({
        queue_id: job.id, org_id: job.org_id, campaign_id: job.campaign_id,
        lead_id: job.lead_id, provider: job.provider ?? "auto", status: "failed", error: err
      });
    }
  }

  return new Response("ok");
});

