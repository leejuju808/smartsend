import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { survivor_id, mergee_id } = await req.json();
  if (!survivor_id || !mergee_id) {
    return NextResponse.json({ ok: false, error: "survivor_id and mergee_id required" }, { status: 400 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: survivor, error: survErr } = await supa
    .from("leads")
    .select("*")
    .eq("id", survivor_id)
    .single();

  if (survErr) {
    return NextResponse.json({ ok: false, error: survErr.message }, { status: 500 });
  }

  const { data: mergee, error: mergeeErr } = await supa
    .from("leads")
    .select("*")
    .eq("id", mergee_id)
    .single();

  if (mergeeErr) {
    return NextResponse.json({ ok: false, error: mergeeErr.message }, { status: 500 });
  }

  const counts = async (leadId: string) => {
    const [{ count: threads }, { count: messages }] = await Promise.all([
      supa.from("threads").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
      supa.from("messages").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
    ]);
    return { threads: threads ?? 0, messages: messages ?? 0 };
  };

  const survivorTotals = await counts(survivor_id);
  const mergeeTotals = await counts(mergee_id);

  return NextResponse.json({
    ok: true,
    survivor,
    mergee,
    totals: { survivor: survivorTotals, mergee: mergeeTotals },
  });
}

