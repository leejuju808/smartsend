import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const MUTABLE_FIELDS = ["name", "scenario", "tone", "subject", "body", "is_active", "sort_order"] as const;

type MutableField = (typeof MUTABLE_FIELDS)[number];

export async function PATCH(req: Request, { params }: { params: { presetId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const patch: Partial<Record<MutableField, unknown>> = {};

  for (const key of MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      patch[key] = body[key];
    }
  }

  const { data, error } = await supabase
    .from("nudge_presets")
    .update(patch)
    .eq("id", params.presetId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preset: data });
}

export async function DELETE(_req: Request, { params }: { params: { presetId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.from("nudge_presets").delete().eq("id", params.presetId);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


