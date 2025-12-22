import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type Body = {
  account_id?: string;
  label?: string;
  preset_key?: string;
};

function invalidUuid(value: unknown): boolean {
  return typeof value !== "string" || !value.match(/^[0-9a-fA-F-]{36}$/);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Body | null;

  const accountId = payload?.account_id;
  const label = payload?.label;
  const presetKey = payload?.preset_key;

  if (!accountId || invalidUuid(accountId)) {
    return NextResponse.json({ ok: false, error: "invalid_account_id" }, { status: 400 });
  }

  if (!label || typeof label !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_label" }, { status: 400 });
  }

  if (!presetKey || typeof presetKey !== "string" || !presetKey.trim()) {
    return NextResponse.json({ ok: false, error: "invalid_preset_key" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("nudge_routing")
    .upsert(
      {
        account_id: accountId,
        label,
        preset_key: presetKey,
        updated_at: now,
      },
      { onConflict: "account_id,label" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, route: data });
}

