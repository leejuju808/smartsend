// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

function parseCSV(text: string) {
  // RFC-lite CSV: handles quotes and commas
  const rows: string[][] = [];
  let cur = ""; let inQ = false; const out: string[][] = [];
  const pushCell = (arr: string[]) => arr.push(cur); 
  const pushRow = (arr: string[], acc: string[][]) => { acc.push(arr.map(s => s.trim())); };
  let row: string[] = [];
  for (let i=0;i<text.length;i++) {
    const c = text[i], n = text[i+1];
    if (c === '"' && inQ && n === '"') { cur += '"'; i++; continue; }
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { pushCell(row); cur = ""; continue; }
    if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && n === '\n') i++;
      pushCell(row); pushRow(row, out); row = []; cur = ""; continue;
    }
    cur += c;
  }
  if (cur.length || row.length) { pushCell(row); pushRow(row, out); }
  return out;
}

Deno.serve(async (req) => {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data")) return new Response("Use multipart/form-data", { status: 400 });

    const form = await req.formData();
    const user_id = String(form.get("user_id") || "");
    const file = form.get("file") as File | null;
    if (!user_id || !file) return new Response("user_id and file required", { status: 400 });

    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return new Response("empty file", { status: 400 });

    const headers = rows[0].map(h => h.toLowerCase());
    const dataRows = rows.slice(1);

    // create job
    const { data: job } = await sb.from("import_jobs").insert({
      user_id, filename: file.name, row_count: dataRows.length, status: "pending"
    }).select("*").single();

    if (!job) return new Response("Failed to create job", { status: 500 });

    // stage rows (raw-by-header)
    const payload = dataRows.map((r, i) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] ?? ""; });
      return { job_id: job.id, row_no: i+2, data: obj };
    });

    // chunked insert
    for (let i = 0; i < payload.length; i += 500) {
      await sb.from("import_rows").insert(payload.slice(i, i+500));
    }

    return new Response(JSON.stringify({ ok: true, job_id: job.id, headers }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});

