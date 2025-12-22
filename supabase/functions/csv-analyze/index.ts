// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = Deno.env.get("IMPORTS_BUCKET") || "imports";

type AnalyzeReq = { job_id: string; storage_path: string; max_preview?: number };

const CANDIDATE_DELIMS = [",", ";", "|", "\t"];
const COMMON = [
  { key: "email", pats: ["email", "e-mail", "work email", "business email"] },
  { key: "first_name", pats: ["first name", "firstname", "first", "given name"] },
  { key: "last_name", pats: ["last name", "lastname", "last", "surname", "family name"] },
  { key: "company", pats: ["company", "company name", "org", "organization", "employer", "business"] },
  { key: "title", pats: ["title", "job title", "role", "position"] },
  { key: "domain", pats: ["domain", "website", "site", "url"] },
  { key: "phone", pats: ["phone", "phone number", "mobile", "cell"] },
  { key: "tz", pats: ["timezone", "time zone", "tz"] },
];

function scoreHeader(name: string, key: string) {
  const n = name.toLowerCase().trim();
  const rec = COMMON.find((c) => c.key === key);
  if (!rec) return 0;
  for (const p of rec.pats) if (n === p) return 5;
  for (const p of rec.pats) if (n.includes(p)) return 3;
  if (key === "email" && /@/.test(n)) return 1;
  return 0;
}

function pickDelimiter(sample: string) {
  let best = { d: ",", s: -1 };
  for (const d of CANDIDATE_DELIMS) {
    const lines = sample.trim().split(/\r?\n/).slice(0, 20);
    const counts = lines.map((l) => l.split(d).length);
    const varc = counts.length ? Math.max(...counts) - Math.min(...counts) : 0;
    const avgc = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
    const score = avgc - varc;
    if (score > best.s) best = { d, s: score };
  }
  return best.d;
}

function parseCSV(text: string, delim: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = (lines.shift() || "").split(delim).map((h) => h.trim());
  const rows = lines.map((line, idx) => {
    const cols = line.split(delim);
    const obj: Record<string, string> = {};
    header.forEach((h, hIdx) => {
      obj[h] = (cols[hIdx] || "").trim();
    });
    return { row_no: idx + 2, raw: obj };
  });
  return { header, rows };
}

Deno.serve(async (req) => {
  const sb = createClient(SB_URL, SRK);
  const { job_id, storage_path, max_preview = 50 } = await req.json() as AnalyzeReq;

  const { data: file, error: downloadError } = await sb.storage.from(BUCKET).download(storage_path);
  if (downloadError || !file) {
    return new Response("file not found", { status: 404 });
  }
  const text = await file.text();

  const delim = pickDelimiter(text.slice(0, 10_000));
  const { header, rows } = parseCSV(text, delim);

  const mapping: Record<string, string | null> = {
    email: null,
    first_name: null,
    last_name: null,
    company: null,
    title: null,
    domain: null,
    phone: null,
    tz: null,
  };

  for (const h of header) {
    for (const k of Object.keys(mapping)) {
      if (mapping[k] === null && scoreHeader(h, k) >= 3) {
        mapping[k] = h;
      }
    }
  }

  if (!mapping.email) {
    for (const h of header) {
      if (h.toLowerCase().includes("email")) {
        mapping.email = h;
        break;
      }
    }
  }

  await sb.from("import_rows").delete().eq("job_id", job_id);

  let total = 0;
  for (const r of rows.slice(0, 5000)) {
    await sb.from("import_rows").insert({ job_id, row_no: r.row_no, raw: r.raw });
    total++;
  }

  await sb.from("import_jobs").update({
    columns: header,
    mapping,
    total_rows: rows.length,
    status: mapping.email ? "ready" : "needs_mapping",
    meta: { delim },
  }).eq("id", job_id);

  return new Response(JSON.stringify({
    ok: true,
    header,
    mapping,
    preview: rows.slice(0, max_preview),
    total_rows: rows.length,
    delimiter: delim,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});

