import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request, { params }: { params: { variantId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));

  const weight = Number(body?.weight);
  if (!Number.isFinite(weight) || weight <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_weight" }, { status: 400 });
  }

  const { error } = await supabase
    .from("nudge_variants")
    .update({ weight })
    .eq("id", params.variantId);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

