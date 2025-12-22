import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const { workspace_id, campaign_id, lead_ids, filter, start_at, rate_per_minute } = await req.json();
    if (!workspace_id || !campaign_id) return new Response(JSON.stringify({ error: "workspace_id and campaign_id required" }), { status: 400 });

    // 1) Resolve target leads
    let leads: { id: string }[] = [];
    if (Array.isArray(lead_ids) && lead_ids.length) {
      const { data, error } = await supabase.from("leads").select("id").eq("workspace_id", workspace_id).in("id", lead_ids);
      if (error) throw error;
      leads = data ?? [];
    } else {
      let query = supabase.from("leads").select("id").eq("workspace_id", workspace_id);
      if (filter?.status) query = query.eq("status", filter.status);
      const { data, error } = await query;
      if (error) throw error;
      leads = data ?? [];
    }
    if (leads.length === 0) return new Response(JSON.stringify({ created: 0, message: "No leads" }), { status: 200 });

    // 2) Build scheduled rows with cadence
    const start = start_at ? new Date(start_at) : new Date();
    const rpm = Math.max(1, Math.min(Number(rate_per_minute ?? 30), 600));
    const intervalMs = Math.floor(60000 / rpm);

    const rows = leads.map((l, idx) => ({
      workspace_id,
      campaign_id,
      lead_id: l.id,
      status: "scheduled",
      attempt_count: 0,
      max_attempts: 3,
      scheduled_at: new Date(start.getTime() + idx * intervalMs).toISOString(),
    }));

    // 3) Avoid duplicate queueing: skip if already queued/sent/replied for this campaign
    const leadIds = leads.map((l) => l.id);
    const { data: existing, error: existErr } = await supabase
      .from("send_queue")
      .select("lead_id")
      .eq("workspace_id", workspace_id)
      .eq("campaign_id", campaign_id)
      .in("lead_id", leadIds);
    if (existErr) throw existErr;
    const existingSet = new Set((existing ?? []).map((r) => r.lead_id));
    const toInsert = rows.filter((r) => !existingSet.has(r.lead_id));

    if (toInsert.length === 0) return new Response(JSON.stringify({ created: 0, skipped: leads.length }), { status: 200 });

    const { error: insErr, count } = await supabase.from("send_queue").insert(toInsert, { count: "exact" });
    if (insErr) throw insErr;

    // 4) Log
    await supabase.from("campaign_logs").insert({
      workspace_id,
      campaign_id,
      type: "schedule_created",
      meta: { count: count ?? toInsert.length, rate_per_minute: rpm, start_at: start.toISOString() },
    });

    return new Response(JSON.stringify({ created: count ?? toInsert.length, skipped: leads.length - (count ?? toInsert.length) }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
  }
});


