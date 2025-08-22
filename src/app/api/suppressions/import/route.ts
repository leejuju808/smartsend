export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { parse } from "csv-parse/sync";
import { normalizeEmail } from "@/lib/email";

type Row = Record<string, string>;

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as unknown as File | null;
  const reason = String(form.get("reason") || "manual");
  if (!file) return NextResponse.json({ error: "file required (CSV)" }, { status: 400 });

  const buf = Buffer.from(await (file as File).arrayBuffer());
  const rows: Row[] = parse(buf, { columns: true, skip_empty_lines: true, bom: true });
  if (!rows.length) return NextResponse.json({ inserted: 0, invalid: 0, total_in_file: 0 });

  const toInsert: any[] = [];
  const rejects: any[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const raw = (r.email || r.Email || r["e-mail"] || r.value || r.Value || "").toString().trim();
    let value = raw.toLowerCase();
    if (!value) { rejects.push({ row: i + 2, reason: "missing" }); continue; }

    // Accept either full email or domain-only values
    const isEmail = value.includes("@");
    if (isEmail) value = normalizeEmail(value);
    const kind = isEmail ? "email" : "domain";

    if (seen.has(`${kind}:${value}`)) { rejects.push({ row: i + 2, reason: "duplicate_in_file", value }); continue; }
    seen.add(`${kind}:${value}`);

    toInsert.push({ user_id: user.id, kind, value_lower: value, reason });
  }

  let inserted = 0;
  if (toInsert.length) {
    const { error } = await supabase.from("suppressions").upsert(toInsert, { onConflict: "user_id,kind,value_lower" });
    if (error) {
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }
    inserted = toInsert.length;
  }

  const invalid = rejects.filter(r => r.reason !== "duplicate_in_file").length;
  return NextResponse.json({ inserted, invalid, skipped: rejects.length - invalid, total_in_file: rows.length });
}

