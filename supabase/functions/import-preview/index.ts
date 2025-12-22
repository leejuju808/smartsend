import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

type Mapping = { email: string; first_name?: string; last_name?: string; company?: string; title?: string; website?: string; custom?: string[] };

Deno.serve(async (req) => {
  try {
    const { job_id, user_id, mapping } = await req.json() as { job_id:string; user_id:string; mapping:Mapping; };
    if (!job_id || !user_id || !mapping?.email) return new Response("missing params", { status: 400 });

    // fetch sample
    const { data: rows } = await sb.from("import_rows").select("id,row_no,data,error").eq("job_id", job_id).limit(2000);
    if (!rows) return new Response("job not found", { status: 404 });

    let deduped = 0, willInsert = 0, skipped = 0;
    const updates: any[] = [];
    const previews: any[] = [];

    // preload existing emails for user (set for O(1) lookups)
    const { data: existing } = await sb.from("leads").select("email").eq("user_id", user_id);
    const seen = new Set((existing ?? []).map(x => (x.email || "").toLowerCase()));

    for (const r of rows) {
      const d = r.data as Record<string,string>;
      const email = String(d[mapping.email] || "").toLowerCase().trim();
      let err = r.error || "";

      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err = err || "invalid_email";

      const leadObj: any = {
        email,
        first_name: mapping.first_name ? d[mapping.first_name] || null : null,
        last_name:  mapping.last_name  ? d[mapping.last_name]  || null : null,
        company:    mapping.company    ? d[mapping.company]    || null : null,
        title:      mapping.title      ? d[mapping.title]      || null : null,
        website:    mapping.website    ? d[mapping.website]    || null : null,
      };

      // custom columns -> meta
      const meta: Record<string,string> = {};
      for (const k of mapping.custom ?? []) if (k && d[k]) meta[k] = d[k];
      if (Object.keys(meta).length) (leadObj as any).meta = meta;

      // dedupe
      const dup = email && seen.has(email);
      const will_insert = !err && !dup;
      if (dup) { deduped++; skipped++; }
      else if (err) { skipped++; }
      else { willInsert++; if (email) seen.add(email); }

      // Store mapped fields back into data for commit step
      const mappedData = { ...d };
      if (mapping.email && d[mapping.email]) mappedData.email = email;
      if (mapping.first_name && d[mapping.first_name]) mappedData.first_name = d[mapping.first_name];
      if (mapping.last_name && d[mapping.last_name]) mappedData.last_name = d[mapping.last_name];
      if (mapping.company && d[mapping.company]) mappedData.company = d[mapping.company];
      if (mapping.title && d[mapping.title]) mappedData.title = d[mapping.title];
      if (mapping.website && d[mapping.website]) mappedData.website = d[mapping.website];
      if (Object.keys(meta).length) mappedData.meta = meta;

      updates.push({ 
        id: r.id, 
        dedupe_key: email || null, 
        will_insert, 
        error: err || null,
        data: mappedData  // Store mapped data back
      });
      if (previews.length < 100) previews.push({ row_no: r.row_no, ...leadObj, error: err || null, duplicate: dup });
    }

    // batch updates
    for (let i=0; i<updates.length; i+=500) {
      await sb.from("import_rows").upsert(updates.slice(i,i+500));
    }

    await sb.from("import_jobs").update({
      status: 'preview', deduped_count: deduped, skipped_count: skipped
    }).eq("id", job_id);

    return new Response(JSON.stringify({
      ok: true,
      preview: previews,
      counts: { total: rows.length, will_insert: willInsert, deduped, skipped }
    }), { headers:{ "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers:{ "content-type":"application/json" } });
  }
});

