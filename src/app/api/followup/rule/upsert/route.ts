import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type IncomingRule = {
  id?: string | null;
  rule_set_id: string;
  position?: number;
  match: Record<string, unknown>;
  action: Record<string, unknown>;
  is_active?: boolean;
};

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as IncomingRule | null;

  if (!body || !body.rule_set_id || typeof body.match !== "object" || typeof body.action !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();

  const payload = {
    id: body.id ?? undefined,
    rule_set_id: body.rule_set_id,
    position: body.position ?? 0,
    match: body.match ?? {},
    action: body.action ?? {},
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from("followup_rules")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase
    .from("followup_rule_sets")
    .update({ updated_at: nowIso })
    .eq("id", body.rule_set_id);

  return NextResponse.json(data);
}






