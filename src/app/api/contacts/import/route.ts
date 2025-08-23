import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { recordEvent } from "@/lib/events";

type IncomingContact = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
};

function normalizeEmail(e: string | undefined): string | null {
  if (!e) return null;
  return e.trim().toLowerCase();
}

function getSupabaseServer() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  // Use cookies for auth (if using Supabase Auth Helpers, adapt accordingly)
  return createClient(supabaseUrl, supabaseAnon, { global: { headers: { 'X-Client-Info': 'smartsend/import' } } });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    // Get user
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = user.id;

    const payload = await req.json();
    const rows: IncomingContact[] = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) {
      return NextResponse.json({ error: "No rows" }, { status: 400 });
    }

    // Client-side may have deduped already; we still dedupe here (by email)
    const map = new Map<string, IncomingContact>();
    for (const r of rows) {
      const email = normalizeEmail(r.email);
      if (!email) continue;
      if (!map.has(email)) {
        map.set(email, {
          email,
          first_name: (r.first_name || "").trim() || undefined,
          last_name: (r.last_name || "").trim() || undefined,
          company: (r.company || "").trim() || undefined
        });
      }
    }
    const unique = Array.from(map.values());

    // Filter out suppressed emails
    const emails = unique.map(r => r.email);
    const { data: suppressed } = await supabase
      .from("suppression_list")
      .select("email")
      .eq("user_id", userId)
      .in("email", emails.map(e => e.toLowerCase()));

    const suppressedSet = new Set((suppressed || []).map(s => s.email.toLowerCase()));
    const toInsert = unique.filter(r => !suppressedSet.has(r.email.toLowerCase()));

    // Chunk upserts to avoid payload limits
    const chunk = <T,>(arr: T[], size = 500) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

    let inserted = 0;
    for (const part of chunk(toInsert, 500)) {
      const records = part.map(p => ({ ...p, user_id: userId }));
      const { error } = await supabase
        .from("contacts")
        .upsert(records, { onConflict: "user_id,email", ignoreDuplicates: false });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      inserted += records.length;
    }

    // Record contacts import event
    await recordEvent(userId, "contacts_imported", { count: inserted });

    // Increment trial counters if user is trialing
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", userId)
        .maybeSingle();
      
      if (prof?.subscription_status === "trialing") {
        await supabase.rpc("increment_trial_contacts", { uid: userId, n: inserted });
      }
    } catch (error) {
      // Don't fail the import if trial counting fails
      console.warn('Trial counting error:', error);
    }

    // Mark onboarding step as complete
    try {
      const { data, error } = await supabase.rpc("merge_onboarding_step", {
        uid: userId,
        k: "import_contacts",
      });
      if (error) {
        console.warn('Failed to update onboarding step:', error);
      }
    } catch (e) {
      // Don't fail the import if onboarding update fails
      console.warn('Failed to update onboarding step:', e);
    }

    return NextResponse.json({
      ok: true,
      received: rows.length,
      unique: unique.length,
      suppressed_skipped: unique.length - toInsert.length,
      upserted: inserted
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}

