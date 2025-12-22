import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json();

  const { error } = await supabase.rpc("upsert_scenario_preset", {
    p_campaign: params.id,
    p_key: body.key,
    p_label: body.label,
    p_sort: body.sort ?? 100,
    p_is_active: body.is_active ?? true,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const key = new URL(req.url).searchParams.get("key");

  if (!key) {
    return NextResponse.json({ ok: false, error: "missing key" }, { status: 400 });
  }

  const { error } = await supabase.rpc("archive_scenario_preset", { p_campaign: params.id, p_key: key });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


