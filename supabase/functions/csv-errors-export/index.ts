import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = Deno.env.get("IMPORTS_BUCKET") || "imports";

type ErrReq = { job_id: string };

function toCSV(rows: any[]) {
  if (!rows.length) return "row_no,errors\n";
  const header = ["row_no", "errors", "data"];
  const body = rows.map((r) => {
    const data = JSON.stringify(r.raw ?? {}).replace(/"/g, '""');
    const errs = Array.isArray(r.errors) ? r.errors.join("|") : "";
    return `${r.row_no},"${errs}","${data}"`;
  }).join("\n");
  return `${header.join(",")}\n${body}\n`;
}

Deno.serve(async (req) => {
  const sb = createClient(SB_URL, SRK);
  const { job_id } = await req.json() as ErrReq;

  const { data: bad } = await sb
    .from("import_rows")
    .select("row_no,errors,raw")
    .eq("job_id", job_id)
    .eq("valid", false)
    .order("row_no", { ascending: true });

  const content = toCSV(bad ?? []);
  const path = `errors/${job_id}.csv`;
  await sb.storage.from(BUCKET).upload(path, new Blob([content], { type: "text/csv" }), { upsert: true });

  const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return new Response(JSON.stringify({ ok: true, url: signed?.signedUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

