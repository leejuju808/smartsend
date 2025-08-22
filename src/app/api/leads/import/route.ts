import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { isIana, guessTzFromEmail } from "@/lib/tz";

type LeadRow = {
  email: string;
  name?: string;
  company?: string;
  custom1?: string;
  custom2?: string;
  custom3?: string;
  timezone?: string; // NEW
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export async function POST(req: Request) {
  const { userId, rows } = await req.json().catch(() => ({}));
  if (!userId || !Array.isArray(rows)) {
    return NextResponse.json({ error: "Missing userId or rows" }, { status: 400 });
  }

  // Resolve owner email for leads table
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: String(profileErr) }, { status: 500 });
  const ownerEmail = (profile as any)?.email as string | undefined;
  if (!ownerEmail) return NextResponse.json({ error: "Missing owner email" }, { status: 400 });

  // Hard guardrails
  if (rows.length > 5000) {
    return NextResponse.json({ error: "Max 5000 rows per import" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  let invalid = 0;

  // Normalize + validate
  const toUpsert: (LeadRow & { owner_email: string; tz?: string | null })[] = [];
  const seen = new Set<string>(); // dedupe within file (email lowercased)
  for (const r of rows as LeadRow[]) {
    const email = String(r?.email || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    const tzRaw = (r as any)?.timezone ? String((r as any).timezone).trim() : "";
    let tz: string | null = null;
    if (tzRaw && isIana(tzRaw)) tz = tzRaw;
    if (!tz) {
      const g = guessTzFromEmail(email);
      if (g && isIana(g)) tz = g;
    }

    toUpsert.push({
      owner_email: ownerEmail,
      email,
      name: r?.name?.slice(0, 120) || (null as any),
      company: r?.company?.slice(0, 120) || (null as any),
      custom1: r?.custom1?.slice?.(0, 255) || (null as any),
      custom2: r?.custom2?.slice?.(0, 255) || (null as any),
      custom3: r?.custom3?.slice?.(0, 255) || (null as any),
      tz: tz || (null as any), // NEW
    });
  }

  if (toUpsert.length === 0) {
    return NextResponse.json({ imported: 0, skipped, invalid, total: rows.length });
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .upsert(toUpsert, { onConflict: "owner_email,email", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  // Determine how many unique rows persisted
  const emails = toUpsert.map((r) => r.email);
  const { data: dupCheck } = await supabaseAdmin
    .from("leads")
    .select("email")
    .eq("owner_email", ownerEmail)
    .in("email", emails);

  const uniquePersisted = dupCheck?.length ?? 0;
  imported = uniquePersisted;
  const duplicates = toUpsert.length - uniquePersisted;
  skipped += Math.max(0, duplicates);

  return NextResponse.json({ imported, skipped, invalid, total: rows.length });
}

