import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { queueIds, note } = await req.json();
    if (!Array.isArray(queueIds) || !queueIds.length) {
      return NextResponse.json({ error: "queueIds[] required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { error } = await supabase.rpc("triage_release", {
      p_queue_ids: queueIds,
      p_note: note ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("triage release error", error);
    return NextResponse.json(
      { error: "Failed to release items" },
      { status: 500 }
    );
  }
}














