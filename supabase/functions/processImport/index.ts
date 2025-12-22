// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function isEmail(x: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x || "");
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { job_id, mapping, fileText } = await req.json();

    // Fetch job
    const { data: job, error: e1 } = await supabase
      .from("import_jobs")
      .select("*")
      .eq("id", job_id)
      .single();
    if (e1 || !job) {
      return new Response(e1?.message ?? "Job not found", { status: 400 });
    }

    // Parse CSV fully
    const lines = (fileText as string).split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(",").map((h) => h.trim());
    const colIdx = (name: string) => Math.max(0, header.findIndex((h) => h === name));

    const emailIdx = colIdx(mapping.email);
    const nameIdx = mapping.name ? colIdx(mapping.name) : -1;
    const companyIdx = mapping.company ? colIdx(mapping.company) : -1;

    const customIdx: Record<string, number> = {};
    for (const [csvCol, _key] of Object.entries(mapping.custom || {})) {
      customIdx[csvCol] = colIdx(csvCol);
    }

    // Prefetch existing emails for dedupe within team
    const { data: existing } = await supabase
      .from("leads")
      .select("email")
      .eq("team_id", job.team_id);
    const existingSet = new Set((existing ?? []).map((r: any) => (r.email as string).toLowerCase()));

    // First pass: build rows with validation
    const toInsert: any[] = [];
    const seen = new Set<string>();
    const rowsToInsert: any[] = [];

    // Clear existing rows for this job
    await supabase.from("import_job_rows").delete().eq("job_id", job_id);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const email = (cols[emailIdx] ?? "").trim().toLowerCase();
      const name = nameIdx >= 0 ? (cols[nameIdx] ?? "").trim() : null;
      const company = companyIdx >= 0 ? (cols[companyIdx] ?? "").trim() : null;

      const errors: string[] = [];
      if (!email) errors.push("Missing email");
      else if (!isEmail(email)) errors.push("Invalid email");
      const duplicate = existingSet.has(email) || seen.has(email);
      if (duplicate) errors.push("Duplicate");

      const meta: Record<string, string> = {};
      for (const [csvCol, key] of Object.entries(mapping.custom || {})) {
        const idx = customIdx[csvCol];
        if (idx >= 0) meta[key] = (cols[idx] ?? "").trim();
      }

      rowsToInsert.push({
        job_id,
        row_number: i,
        raw: { email, name, company, ...meta },
        valid: errors.length === 0,
        errors,
        deduped: duplicate,
      });

      if (errors.length === 0) {
        toInsert.push({ team_id: job.team_id, email, name, company, meta });
        seen.add(email);
      }
    }

    // Batch insert import_job_rows
    if (rowsToInsert.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < rowsToInsert.length; i += batchSize) {
        const batch = rowsToInsert.slice(i, i + batchSize);
        await supabase.from("import_job_rows").insert(batch);
      }
    }

    // Bulk insert valid leads
    if (toInsert.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error: e3 } = await supabase.from("leads").insert(chunk);
        if (e3) {
          console.error("Bulk insert error:", e3);
        }
      }
    }

    await supabase
      .from("import_jobs")
      .update({
        status: "Done",
        imported_rows: toInsert.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({ ok: true, imported: toInsert.length, total: lines.length - 1 }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Process import error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Processing failed" }), {
      status: 500,
    });
  }
});

