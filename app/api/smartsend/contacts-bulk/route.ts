import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

type Row = {
  email: string;
  name?: string;
  company?: string;
  title?: string;
  phone?: string;
  tags?: string[];
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
    const user_id = body?.user_id || crypto.randomUUID(); // TODO: replace with auth later

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "No rows" }, { status: 400 });
    }

    // sanitize + dedupe by email
    const seen = new Set<string>();
    const clean = rows
      .map((r) => ({
        user_id,
        email: String(r.email || "").trim().toLowerCase(),
        name: r.name?.trim() || null,
        company: r.company?.trim() || null,
        title: r.title?.trim() || null,
        phone: r.phone?.trim() || null,
        tags: (r.tags || []).filter(Boolean),
      }))
      .filter((r) => r.email && !seen.has(r.email) && seen.add(r.email));

    const sb = supabaseService();
    // Upsert by (user_id, email) — emulate composite unique constraint via ON CONFLICT on unique(user_id,email)
    const { error } = await sb.from("contacts").upsert(clean, { onConflict: "user_id,email" });
    if (error) throw error;

    return NextResponse.json({ ok: true, inserted: clean.length });
  } catch (e: any) {
    console.error("CONTACTS_BULK_ERROR", e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}