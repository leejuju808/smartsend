export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { parse } from "csv-parse/sync";

type Row = Record<string, string | undefined>;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: auth, error: userErr } = await supabase.auth.getUser();
  if (userErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = auth.user;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const filename = file.name || "upload.csv";

  const buf = Buffer.from(await file.arrayBuffer());
  let rows: Row[] = [];
  try {
    rows = parse(buf, { columns: true, skip_empty_lines: true, trim: true }) as Row[];
  } catch {
    return NextResponse.json({ error: "CSV parse failed" }, { status: 400 });
  }
  if (!rows.length) return NextResponse.json({ error: "Empty CSV" }, { status: 400 });

  const normalizeKey = (k: string) => k.trim().toLowerCase();
  const normed = rows.map((r) => {
    const out: Row = {};
    for (const k of Object.keys(r)) out[normalizeKey(k)] = r[k];
    return out;
  });

  const emailKey =
    ["email", "e-mail", "work email", "business email"].find((k) => k in (normed[0] || {})) || "email";
  if (!(emailKey in (normed[0] || {}))) {
    return NextResponse.json({ error: "No 'email' column found in header" }, { status: 400 });
  }
  const firstKey = ["first_name", "firstname", "first"].find((k) => k in (normed[0] || {})) || "first_name";
  const lastKey = ["last_name", "lastname", "last"].find((k) => k in (normed[0] || {})) || "last_name";
  const companyKey = ["company", "org", "organization"].find((k) => k in (normed[0] || {})) || "company";

  const { data: suppressed, error: supErr } = await supabase
    .from("suppression_list")
    .select("email")
    .eq("user_id", user.id);
  if (supErr) return NextResponse.json({ error: "Failed to load suppression list" }, { status: 500 });

  const suppressedSet = new Set((suppressed || []).map((r) => String(r.email).toLowerCase()));

  const seenInFile = new Set<string>();
  const batch: Array<{ user_id: string; email: string; first_name?: string; last_name?: string; company?: string }> =
    [];

  let total = 0,
    invalid = 0,
    inFileDup = 0,
    skippedSuppressed = 0;

  for (const r of normed) {
    total++;
    const rawEmail = String(r[emailKey] || "").trim();
    const email = rawEmail.toLowerCase();

    if (!EMAIL_RE.test(email)) {
      invalid++;
      continue;
    }
    if (suppressedSet.has(email)) {
      skippedSuppressed++;
      continue;
    }
    if (seenInFile.has(email)) {
      inFileDup++;
      continue;
    }
    seenInFile.add(email);

    const first_name = (r[firstKey] || "")?.toString().trim() || undefined;
    const last_name = (r[lastKey] || "")?.toString().trim() || undefined;
    const company = (r[companyKey] || "")?.toString().trim() || undefined;

    batch.push({ user_id: user.id, email, first_name, last_name, company });
  }

  // Upsert in chunks
  const chunkSize = 1000;
  let insertedOrUpdated = 0;

  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("contacts")
      .upsert(chunk, { onConflict: "user_id,email", ignoreDuplicates: false })
      .select("id");
    if (error) {
      return NextResponse.json({ error: `Upsert failed at chunk ${i / chunkSize + 1}` }, { status: 500 });
    }
    insertedOrUpdated += data?.length || 0;
  }

  // Track import summary (best-effort)
  await supabase.from("imports").insert({
    user_id: user.id,
    filename,
    total_rows: total,
    inserted: insertedOrUpdated,
    skipped_duplicate: inFileDup,
    skipped_suppressed: skippedSuppressed,
    invalid,
  });

  return NextResponse.json({
    ok: true,
    filename,
    stats: {
      total,
      processed: batch.length,
      inserted_or_updated: insertedOrUpdated,
      in_file_duplicates: inFileDup,
      suppressed: skippedSuppressed,
      invalid,
    },
  });
} 