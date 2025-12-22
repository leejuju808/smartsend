import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

function csvEscape(v: any) {
  const s = String(v ?? "");
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

Deno.serve(async (req) => {
  try {
    const { job_id, user_id } = await req.json();
    if (!job_id || !user_id) return new Response("missing params", { status: 400 });

    const { data: rows } = await sb.from("import_rows")
      .select("row_no,data,error,will_insert,dedupe_key")
      .eq("job_id", job_id);

    if (!rows?.length) return new Response("no rows", { status: 404 });

    const toInsert: any[] = [];
    const errors: any[] = [];

    for (const r of rows) {
      const d = r.data as Record<string,string>;
      if (r.will_insert) {
        toInsert.push({
          user_id,
          email: r.dedupe_key || "",  // use dedupe_key which is the cleaned email
          first_name: d.first_name ?? null,
          last_name: d.last_name ?? null,
          company: d.company ?? null,
          title: d.title ?? null,
          website: d.website ?? null,
          domain: r.dedupe_key ? r.dedupe_key.split("@")[1] : null,
          meta: d.meta ? (typeof d.meta === 'string' ? JSON.parse(d.meta) : d.meta) : ({}),
          created_at: new Date().toISOString()
        });
      } else {
        errors.push({
          row_no: r.row_no,
          reason: r.error || (r.dedupe_key ? "duplicate" : "invalid"),
          email: (r.dedupe_key ?? ""),
          first_name: d.first_name ?? "",
          last_name: d.last_name ?? "",
          company: d.company ?? "",
          title: d.title ?? "",
          website: d.website ?? ""
        });
      }
    }

    // insert leads in chunks, ignore conflicts (unique per user_id,email)
    let inserted = 0;
    for (let i=0; i<toInsert.length; i+=500) {
      const { count } = await sb.from("leads").insert(toInsert.slice(i,i+500), { count: "exact" }).select("id", { count: "exact" });
      inserted += (count ?? 0);
    }

    // build errors.csv content
    let csv = "row_no,reason,email,first_name,last_name,company,title,website\n";
    for (const e of errors) {
      csv += [e.row_no, e.reason, e.email, e.first_name, e.last_name, e.company, e.title, e.website].map(csvEscape).join(",") + "\n";
    }

    await sb.from("import_jobs").update({
      status: 'done',
      inserted_count: inserted,
      skipped_count: errors.length
    }).eq("id", job_id);

    return new Response(csv, {
      headers: {
        "content-type":"text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="errors_${job_id}.csv"`
      }
    });
  } catch (e) {
    const body = await req.json().catch(()=>({}));
    await sb.from("import_jobs").update({ status:'error', error:String(e).slice(0,300) }).eq("id", body.job_id ?? null);
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});

