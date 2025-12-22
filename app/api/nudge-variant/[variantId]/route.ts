import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type PatchableKeys =
  | "name"
  | "scenario"
  | "tone"
  | "subject"
  | "body"
  | "weight"
  | "is_active"
  | "pinned"
  | "pinned_weight";

const PATCH_KEYS: PatchableKeys[] = ["name", "scenario", "tone", "subject", "body", "weight", "is_active", "pinned", "pinned_weight"];

export async function PATCH(req: Request, { params }: { params: { variantId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const key of PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      patch[key] = body[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("nudge_variants")
    .update(patch)
    .eq("id", params.variantId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, variant: data });
}

export async function DELETE(_req: Request, { params }: { params: { variantId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.from("nudge_variants").delete().eq("id", params.variantId);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


