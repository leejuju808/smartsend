import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scope = body.scope as string | undefined;
  const kind = body.kind as string | undefined;
  const values = Array.isArray(body.values) ? body.values : [];

  if (!scope || !kind) {
    return NextResponse.json({ error: "scope and kind are required" }, { status: 400 });
  }

  if (!values.length) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  for (const raw of values) {
    const value = typeof raw === "string" ? raw : String(raw ?? "");
    if (!value.trim()) {
      continue;
    }
    const { error } = await service.rpc("add_suppression", {
      p_scope: scope,
      p_kind: kind,
      p_value: value,
      p_reason: body.reason ?? "import",
      p_account: body.account_id ?? null,
      p_campaign: body.campaign_id ?? null,
      p_note: body.note ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: values.length });
}
