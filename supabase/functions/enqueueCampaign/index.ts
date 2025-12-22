// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { campaign_id } = await req.json();

  // load campaign + eligible leads
  const { data: camp, error: e1 } = await supabase.from("campaigns").select("*").eq("id", campaign_id).single();
  if (e1 || !camp) return new Response(e1?.message ?? "Campaign not found", { status: 400 });

  // fetch leads for this campaign not yet queued/sent
  const { data: cls, error: e2 } = await supabase
    .from("campaign_leads")
    .select("id, lead_id, state")
    .eq("campaign_id", campaign_id)
    .in("state", ["Pending","Skipped"]);
  if (e2) return new Response(e2.message, { status: 500 });

  // fetch lead details
  const leadIds = (cls ?? []).map((c:any) => c.lead_id);
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, email, name, company")
    .in("id", leadIds);
  if (leadsErr) return new Response(leadsErr.message, { status: 500 });

  const leadMap = new Map((leads ?? []).map((l:any) => [l.id, l]));

  // skip suppressed
  const emails = (leads ?? []).map((l:any)=>l.email).filter(Boolean);
  let suppressedSet = new Set<string>();
  if (emails.length > 0) {
    const { data: suppressed } = await supabase
      .from("suppress_list")
      .select("email")
      .eq("workspace_id", camp.workspace_id)
      .in("email", emails);
    suppressedSet = new Set((suppressed ?? []).map((s:any)=>s.email));
  }

  // very light template render (replace {{name}}, {{company}})
  function render(t:string, vars:Record<string,string>) {
    return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
  }

  const rows = [];
  const queuedIds: string[] = [];
  const skippedIds: string[] = [];
  
  for (const c of cls ?? []) {
    const lead = leadMap.get(c.lead_id);
    if (!lead) continue;
    const email = lead.email;
    if (!email || suppressedSet.has(email)) {
      skippedIds.push(c.id);
      continue;
    }
    const vars = {
      name: lead.name ?? "",
      company: lead.company ?? "",
      email: email
    };
    rows.push({
      campaign_id,
      lead_id: c.lead_id,
      to_email: email,
      subject: render(camp.subject_template || "", vars),
      body: render(camp.body_template || "", vars),
      provider: "gmail",
      priority: 100
    });
    queuedIds.push(c.id);
  }

  // Update skipped ones
  if (skippedIds.length > 0) {
    await supabase.from("campaign_leads").update({ state: "Skipped" })
      .in("id", skippedIds);
  }

  if (rows.length) {
    const { error: e3 } = await supabase.from("send_queue").insert(rows);
    if (e3) return new Response(e3.message, { status: 500 });
    // Update only the ones we actually queued
    await supabase.from("campaign_leads").update({ state: "Queued" })
      .in("id", queuedIds);
  }

  await supabase.from("campaigns").update({ status: "Scheduled", updated_at: new Date().toISOString() }).eq("id", campaign_id);

  return new Response(JSON.stringify({ queued: rows.length }), { headers: { "Content-Type": "application/json" } });
});
