// SmartSend Lead Import Parser
// Parses CSV files from storage and stages them for validation

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function normalizeRow(row: Record<string, string>, map: Record<string, string>) {
  // map CSV headers -> internal keys
  const out: any = {};
  for (const [csvKey, target] of Object.entries(map)) {
    if (row[csvKey]) {
      out[target] = String(row[csvKey]).trim();
    }
  }
  
  // email normalize
  if (out.email) {
    out.email = out.email.toLowerCase();
    const at = out.email.indexOf("@");
    out.email_domain = at > 0 ? out.email.slice(at + 1) : null;
  }
  
  return out;
}

function validate(out: any): string[] {
  const errs: string[] = [];
  if (!out.email) {
    errs.push("missing_email");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    errs.push("bad_email");
  }
  // optional: website URL, name length, etc.
  return errs;
}

async function parseCSV(text: string) {
  // simple CSV parser - for production consider PapaParse
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.length > 0);
  
  if (lines.length === 0) {
    return { cols: [], rows: [] };
  }
  
  const header = lines[0];
  const cols = header.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
  
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter(Boolean) ?? [];
    const values = parts.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"'));
    
    if (values.length > 0) {
      const r: any = {};
      cols.forEach((c, idx) => {
        if (idx < values.length) {
          r[c] = values[idx] ?? "";
        }
      });
      rows.push(r);
    }
    
    if (i > 100000) break; // sanity cap
  }
  
  return { cols, rows };
}

Deno.serve(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      upload_id: string;
      storage_path: string;
      mapping: Record<string, string>;
    };

    // Mark as parsing
    await supabase
      .from("lead_uploads")
      .update({ status: "parsing", updated_at: new Date().toISOString() })
      .eq("id", body.upload_id);

    // Fetch file from storage
    const url = `${SUPABASE_URL}/storage/v1/object/public/${body.storage_path}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch file: ${resp.statusText}`);
    }
    const text = await resp.text();

    // Parse + stage
    const { rows } = await parseCSV(text);
    let valid = 0;
    let invalid = 0;
    const batch: any[] = [];
    let rownum = 1;

    for (const r of rows) {
      const norm = normalizeRow(r, body.mapping);
      const errs = validate(norm);
      const isValid = errs.length === 0;
      if (isValid) valid++;
      else invalid++;

      batch.push({
        upload_id: body.upload_id,
        rownum: rownum++,
        raw: r,
        normalized: norm,
        errors: errs,
        valid: isValid,
      });

      if (batch.length >= 1000) {
        await supabase.from("lead_upload_rows").insert(batch);
        batch.length = 0;
      }
    }
    
    if (batch.length > 0) {
      await supabase.from("lead_upload_rows").insert(batch);
    }

    await supabase
      .from("lead_uploads")
      .update({
        status: "ready",
        total_rows: valid + invalid,
        valid_rows: valid,
        invalid_rows: invalid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.upload_id);

    return new Response("ok", { status: 200 });
  } catch (error: any) {
    console.error("Parse error:", error);
    
    // Try to mark upload as error if we have the ID
    try {
      const body = await req.json();
      await supabase
        .from("lead_uploads")
        .update({
          status: "error",
          error_msg: error.message || "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", (body as any).upload_id);
    } catch {}
    
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

