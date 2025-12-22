import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { leadId, starred, resolved, notes } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const supabase = createClient(url, service, { auth: { persistSession: false } });

    const { error } = await supabase
      .from("inbox_triage")
      .upsert(
        { lead_id: leadId, starred: !!starred, resolved: !!resolved, notes: notes ?? null, updated_at: new Date().toISOString() },
        { onConflict: "lead_id" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Triage update failed" }, { status: 500 });
  }
}


