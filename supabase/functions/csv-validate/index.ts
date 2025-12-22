import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Mapping = Record<string, string | null | undefined>;
type ValidateReq = { job_id: string; user_id: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    groups.push(arr.slice(i, i + size));
  }
  return groups;
}

Deno.serve(async (req) => {
  const sb = createClient(SB_URL, SRK);
  const { job_id, user_id } = await req.json() as ValidateReq;

  if (!user_id) {
    return new Response("user required", { status: 400 });
  }

  const { data: job, error: jobError } = await sb.from("import_jobs").select("mapping").eq("id", job_id).maybeSingle();
  if (jobError || !job?.mapping) {
    return new Response("mapping required", { status: 400 });
  }

  const mapping = job.mapping as Mapping;
  const { data: rows, error: rowsError } = await sb
    .from("import_rows")
    .select("id,row_no,raw")
    .eq("job_id", job_id)
    .limit(5000);

  if (rowsError) {
    return new Response("rows not found", { status: 404 });
  }

  const emailToRows = new Map<string, string[]>();
  const updates: Array<{ id: string; raw: Record<string, string>; normalized: null; valid: null; errors: null }> = [];

  for (const r of rows ?? []) {
    const raw = (r.raw as Record<string, string>) || {};

    const pick = (key: string | null | undefined) => {
      if (!key) return "";
      return (raw[key] ?? "").toString().trim();
    };

    const email = pick(mapping.email).toLowerCase();
    const mapped = {
      ...raw,
      email,
      first_name: pick(mapping.first_name),
      last_name: pick(mapping.last_name),
      company: pick(mapping.company),
      domain: pick(mapping.domain),
      tz: pick(mapping["tz"]),
    } as Record<string, string>;

    if (email) {
      const list = emailToRows.get(email) ?? [];
      list.push(String(r.id));
      emailToRows.set(email, list);
    }

    updates.push({
      id: String(r.id),
      raw: mapped,
      normalized: null,
      valid: null,
      errors: null,
    });
  }

  for (const group of chunk(updates, 500)) {
    const { error } = await sb.from("import_rows").upsert(group);
    if (error) {
      return new Response(error.message, { status: 500 });
    }
  }

  const { data: revalidated, error: revalidateError } = await sb.rpc("import_job_revalidate", { p_job_id: job_id });
  if (revalidateError) {
    return new Response(revalidateError.message || "revalidate failed", { status: 500 });
  }

  const fileDuplicateIds = new Set<string>();
  for (const ids of emailToRows.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => fileDuplicateIds.add(id));
    }
  }

  const dbDuplicateIds = new Set<string>();
  if (emailToRows.size > 0) {
    const emailKeys = Array.from(emailToRows.keys());
    const { data: existing, error: existingError } = await sb
      .from("leads")
      .select("email")
      .eq("user_id", user_id)
      .in("email", emailKeys);
    if (existingError) {
      return new Response(existingError.message, { status: 500 });
    }
    const existingEmails = new Set((existing ?? []).map((row) => (row.email || "").toLowerCase()).filter(Boolean));
    for (const email of existingEmails) {
      const ids = emailToRows.get(email);
      if (ids) ids.forEach((id) => dbDuplicateIds.add(id));
    }
  }

  const duplicateIds = new Set<string>([...fileDuplicateIds, ...dbDuplicateIds]);

  if (duplicateIds.size > 0) {
    const { data: dupRows, error: dupError } = await sb
      .from("import_rows")
      .select("id, errors")
      .in("id", Array.from(duplicateIds));
    if (dupError) {
      return new Response(dupError.message, { status: 500 });
    }

    const duplicateUpdates = (dupRows ?? []).map((row) => {
      const existingErrors = Array.isArray(row.errors)
        ? (row.errors as string[])
        : row.errors
          ? [String(row.errors)]
          : [];
      const next = new Set(existingErrors);
      if (fileDuplicateIds.has(row.id as string)) next.add("duplicate_file");
      if (dbDuplicateIds.has(row.id as string)) next.add("duplicate_db");
      return {
        id: row.id as string,
        valid: false,
        errors: Array.from(next),
      };
    });

    for (const group of chunk(duplicateUpdates, 500)) {
      const { error } = await sb.from("import_rows").upsert(group);
      if (error) {
        return new Response(error.message, { status: 500 });
      }
    }
  }

  const { data: finalRows, error: finalFetchError } = await sb
    .from("import_rows")
    .select("id, valid")
    .eq("job_id", job_id)
    .limit(5000);
  if (finalFetchError) {
    return new Response(finalFetchError.message, { status: 500 });
  }

  const good = (finalRows ?? []).filter((r) => r.valid === true).length;
  const bad = (finalRows ?? []).filter((r) => r.valid === false).length;

  await sb.from("import_jobs").update({
    status: bad > 0 ? "needs_fix" : "ready",
    good_rows: good,
    bad_rows: bad,
  }).eq("id", job_id);

  return new Response(JSON.stringify({ ok: true, good, bad }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

