import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function PATCH(req: Request, { params }: { params: { variantId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));

  const pinned = !!(body as Record<string, unknown>)?.pinned;
  const pinnedWeightRaw = (body as Record<string, unknown>)?.pinned_weight;
  const pinned_weight =
    pinnedWeightRaw === null
      ? null
      : typeof pinnedWeightRaw === "number"
        ? pinnedWeightRaw
        : undefined;

  const patch: Record<string, unknown> = { pinned };
  if (pinned_weight !== undefined) {
    patch.pinned_weight = pinned_weight;
  }

  const { error } = await supabase.from("nudge_variants").update(patch).eq("id", params.variantId);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


