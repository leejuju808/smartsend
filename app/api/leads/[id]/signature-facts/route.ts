import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "missing_supabase_env" },
      { status: 500 },
    );
  }

  const supa = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: best, error: bestError } = await supa
    .from("v_signature_best")
    .select("*")
    .eq("lead_id", params.id)
    .maybeSingle();

  if (bestError) {
    return NextResponse.json(
      { ok: false, error: "best_lookup_failed", details: bestError.message },
      { status: 500 },
    );
  }

  const { data: history, error: historyError } = await supa
    .from("signature_facts")
    .select("*")
    .eq("lead_id", params.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (historyError) {
    return NextResponse.json(
      { ok: false, error: "history_lookup_failed", details: historyError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, best, history });
}

