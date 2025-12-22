import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type IncomingRow = Record<string, string | null | undefined>;

function normalizeEmail(raw?: string | null) {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  // very light guard; full RFC isn't needed for this slice
  if (!e.includes("@") || e.startsWith("@") || e.endsWith("@")) return null;
  return e;
}
function emailDomain(email: string) {
  return email.split("@")[1] || "";
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role for batch upserts
);

export async function POST(req: NextRequest) {
  try {
    // Payload shape:
    // {
    //   rows: IncomingRow[],
    //   mapping: { email: string; first_name?: string; last_name?: string; company?: string; title?: string }
    //   options?: { dedupeBy?: "email" | "email+company"; skipSuppressed?: boolean }
    // }
    const { rows, mapping, options } = await req.json();

    if (!rows?.length) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }
    if (!mapping?.email) {
      return NextResponse.json({ error: "Mapping must include 'email' column" }, { status: 400 });
    }

    const dedupeBy: "email" | "email+company" = options?.dedupeBy || "email";
    const skipSuppressed = options?.skipSuppressed ?? true;

    // 1) Normalize + project to contact records
    type ContactInsert = {
      email: string;
      normalized_email: string;
      domain: string;
      first_name?: string | null;
      last_name?: string | null;
      company?: string | null;
      title?: string | null;
    };

    const staged: ContactInsert[] = [];
    const rejected: Array<{ row: IncomingRow; reason: string }> = [];

    for (const r of rows as IncomingRow[]) {
      const emailRaw = r[mapping.email];
      const email = normalizeEmail(
        typeof emailRaw === "string" ? emailRaw : String(emailRaw ?? "")
      );
      if (!email) {
        rejected.push({ row: r, reason: "Invalid email" });
        continue;
      }
      const item: ContactInsert = {
        email,
        normalized_email: email,
        domain: emailDomain(email),
        first_name: mapping.first_name ? (r[mapping.first_name] ?? null)?.toString() ?? null : null,
        last_name: mapping.last_name ? (r[mapping.last_name] ?? null)?.toString() ?? null : null,
        company: mapping.company ? (r[mapping.company] ?? null)?.toString() ?? null : null,
        title: mapping.title ? (r[mapping.title] ?? null)?.toString() ?? null : null,
      };
      staged.push(item);
    }

    if (!staged.length) {
      return NextResponse.json({
        inserted: 0,
        skipped_existing: 0,
        suppressed: 0,
        rejected: rejected.length,
        rejected_samples: rejected.slice(0, 10),
      });
    }

    // 2) In-memory dedupe within file
    const keyOf = (c: ContactInsert) =>
      dedupeBy === "email" ? c.normalized_email : `${c.normalized_email}::${c.company ?? ""}`;
    const seen = new Set<string>();
    const unique: ContactInsert[] = [];
    for (const c of staged) {
      const k = keyOf(c);
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(c);
    }

    // 3) Suppression filtering (email + domain)
    let suppressedCount = 0;
    let filtered = unique;
    if (skipSuppressed) {
      const emails = unique.map((u) => u.normalized_email);
      const domains = Array.from(new Set(unique.map((u) => u.domain)));

      const { data: supEmailData, error: supEmailErr } = await supabaseAdmin
        .from("suppressions")
        .select("value")
        .in("value", emails)
        .eq("type", "email");

      if (supEmailErr) throw supEmailErr;

      const { data: supDomainData, error: supDomainErr } = await supabaseAdmin
        .from("suppressions")
        .select("value")
        .in("value", domains)
        .eq("type", "domain");

      if (supDomainErr) throw supDomainErr;

      const supEmails = new Set((supEmailData ?? []).map((d) => d.value));
      const supDomains = new Set((supDomainData ?? []).map((d) => d.value));

      filtered = unique.filter((u) => {
        const isSuppressed = supEmails.has(u.normalized_email) || supDomains.has(u.domain);
        if (isSuppressed) suppressedCount++;
        return !isSuppressed;
      });
    }

    // 4) Skip ones already in contacts (by normalized_email)
    const chunkSize = 1000;
    const chunks: ContactInsert[][] = [];
    for (let i = 0; i < filtered.length; i += chunkSize) {
      chunks.push(filtered.slice(i, i + chunkSize));
    }

    let existingCount = 0;
    let toInsert: ContactInsert[] = [];

    for (const ch of chunks) {
      const emails = ch.map((c) => c.normalized_email);
      const { data: exists, error: exErr } = await supabaseAdmin
        .from("contacts")
        .select("normalized_email")
        .in("normalized_email", emails);

      if (exErr) throw exErr;
      const existSet = new Set((exists ?? []).map((e) => e.normalized_email));
      for (const c of ch) {
        if (existSet.has(c.normalized_email)) {
          existingCount++;
        } else {
          toInsert.push(c);
        }
      }
    }

    // 5) Insert new contacts
    let inserted = 0;
    if (toInsert.length) {
      const { error: insErr } = await supabaseAdmin.from("contacts").insert(
        toInsert.map((c) => ({
          email: c.email,
          normalized_email: c.normalized_email,
          domain: c.domain,
          first_name: c.first_name,
          last_name: c.last_name,
          company: c.company,
          title: c.title,
        }))
      );
      if (insErr) throw insErr;
      inserted = toInsert.length;
    }

    return NextResponse.json({
      inserted,
      skipped_existing: existingCount,
      suppressed: suppressedCount,
      rejected: rejected.length,
      sample_inserted: toInsert.slice(0, 5),
      rejected_samples: rejected.slice(0, 5),
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message ?? "Import failed" }, { status: 500 });
  }
}
