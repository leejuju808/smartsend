import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const account = new URL(req.url).searchParams.get("account");
  if (!account) {
    return NextResponse.json({ ok: false, error: "account required" }, { status: 400 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rows, error } = await supa
    .from("lead_match_candidates")
    .select("id, lead_id_a, lead_id_b, reason, score")
    .eq("account_id", account)
    .eq("status", "open")
    .order("score", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = Array.from(new Set(rows?.flatMap((r) => [r.lead_id_a, r.lead_id_b]) ?? []));

  const { data: leads, error: leadErr } = await supa
    .from("leads")
    .select(
      "id, email, first_name, last_name, company_name, title, phone, employee_count, tech_stack, updated_at"
    )
    .in("id", ids);

  if (leadErr) {
    return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  }

  const map = new Map((leads ?? []).map((l) => [l.id, l]));
  const out =
    rows?.map((r) => ({
      ...r,
      a: map.get(r.lead_id_a),
      b: map.get(r.lead_id_b),
    })) ?? [];

  return NextResponse.json({ ok: true, items: out });
}

