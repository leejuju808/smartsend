import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { contactsPayloadSchema } from "@/lib/validation/contacts";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = contactsPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { userEmail, contacts, skipSuppressed, dryRun } = parsed.data;

    // 1) Resolve profile_id from userEmail
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", userEmail)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found for userEmail" }, { status: 404 });
    }
    const profile_id = profile.id;

    // 2) Load existing contacts + suppressions for fast checks
    const { data: existingContacts } = await supabaseAdmin
      .from("contacts")
      .select("email")
      .eq("profile_id", profile_id);

    const { data: suppressed } = await supabaseAdmin
      .from("suppressions")
      .select("email")
      .eq("profile_id", profile_id);

    const existingSet = new Set((existingContacts || []).map((c) => String(c.email).toLowerCase()));
    const suppressedSet = new Set((suppressed || []).map((s) => String(s.email).toLowerCase()));

    // 3) Batch dedupe + classification
    const batchSeen = new Set<string>();
    const toInsert: Array<{ profile_id: string; email: string; first_name?: string | null; last_name?: string | null; company?: string | null }> = [];

    const results = {
      inserted: 0,
      skipped_duplicate_in_file: 0,
      skipped_duplicate_in_db: 0,
      skipped_suppressed: 0,
      invalid: 0,
      examples_invalid: [] as Array<{ email?: string; reason: string }>,
    };

    for (const raw of contacts) {
      const email = String(raw.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.invalid++;
        if (results.examples_invalid.length < 3) {
          results.examples_invalid.push({ email: raw.email, reason: "invalid_email" });
        }
        continue;
      }
      if (batchSeen.has(email)) {
        results.skipped_duplicate_in_file++;
        continue;
      }
      batchSeen.add(email);

      if (existingSet.has(email)) {
        results.skipped_duplicate_in_db++;
        continue;
      }
      if (skipSuppressed && suppressedSet.has(email)) {
        results.skipped_suppressed++;
        continue;
      }

      toInsert.push({
        profile_id,
        email,
        first_name: raw.first_name ?? null,
        last_name: raw.last_name ?? null,
        company: raw.company ?? null,
      });
    }

    // 4) Insert if not dry run
    if (!dryRun && toInsert.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from("contacts").insert(toInsert);
      if (insertErr) {
        return NextResponse.json({ error: `Insert failed: ${insertErr.message}` }, { status: 500 });
      }
      results.inserted = toInsert.length;
    }

    return NextResponse.json({
      profile_id,
      dryRun,
      skipSuppressed,
      toInsert: dryRun ? toInsert.length : undefined,
      results,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "server_error" }, { status: 500 });
  }
}
