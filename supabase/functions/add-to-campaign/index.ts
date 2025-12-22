// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function leadsFromImport(job_id: string, user_id: string) {
  // take the staged rows marked will_insert, map to actual lead ids now present
  const { data: rows } = await sb
    .from("import_rows")
    .select("dedupe_key, will_insert")
    .eq("job_id", job_id);

  const emails = Array.from(new Set((rows ?? [])
    .filter(r => r.will_insert && r.dedupe_key)
    .map(r => r.dedupe_key!.toLowerCase())));

  const ids: string[] = [];
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await sb
      .from("leads")
      .select("id,email,unsubscribed,suppressed")
      .eq("user_id", user_id)
      .in("email", emails.slice(i, i + 500));
    for (const L of data ?? []) {
      if (!L.unsubscribed && !L.suppressed) ids.push(L.id);
    }
  }
  return ids;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const {
      campaign_id,
      user_id,
      job_id,             // optional: attach from this import job
      lead_ids,           // optional: explicit list
      base,               // optional base scheduled time
      include_jitter = false
    } = body;

    if (!campaign_id || !user_id) {
      return new Response(JSON.stringify({ ok:false, error: "campaign_id and user_id required" }), { status: 400 });
    }

    // 1) Gather target lead ids
    let ids: string[] = [];
    if (Array.isArray(lead_ids) && lead_ids.length) ids = lead_ids;
    else if (job_id) ids = await leadsFromImport(job_id, user_id);
    else return new Response(JSON.stringify({ ok:false, error:"Provide lead_ids or job_id" }), { status: 400 });

    if (!ids.length) return new Response(JSON.stringify({ ok:true, added:0, enqueued:0 }), { headers: { "content-type":"application/json" } });

    // 2) Attach to campaign_members (ignore existing)
    let added = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500).map((id: string) => ({
        campaign_id, lead_id: id, added_by: user_id
      }));
      await sb.from("campaign_members").upsert(chunk, { onConflict: "campaign_id,lead_id" });
      added += chunk.length;
    }

    // 3) Enqueue Step 1 for those leads (SQL helper does dedupe & schedule)
    const { data: enq, error: enqErr } = await sb.rpc("enqueue_step1_for_leads", {
      p_campaign: campaign_id,
      p_leads: ids,
      p_base: base ?? new Date().toISOString(),
      p_include_jitter: !!include_jitter
    });
    if (enqErr) throw enqErr;

    return new Response(JSON.stringify({ ok:true, added, enqueued: enq ?? 0 }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});

