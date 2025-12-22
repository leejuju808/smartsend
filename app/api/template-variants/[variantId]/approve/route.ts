import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  _req: Request,
  { params }: { params: { variantId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: variant, error: variantErr } = await supabase
    .from("followup_template_variants")
    .select("id, base_template_id, tone, campaign_id")
    .eq("id", params.variantId)
    .single();

  if (variantErr || !variant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error: demoteErr } = await supabase
    .from("followup_template_variants")
    .update({ status: "archived" })
    .eq("base_template_id", variant.base_template_id)
    .eq("tone", variant.tone)
    .eq("status", "approved");

  if (demoteErr) {
    return NextResponse.json({ error: demoteErr.message }, { status: 400 });
  }

  const { error: approveErr } = await supabase
    .from("followup_template_variants")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq("id", variant.id);

  if (approveErr) {
    const status = approveErr.message.includes("permission denied") ? 403 : 400;
    return NextResponse.json({ error: approveErr.message }, { status });
  }

  return NextResponse.json({ ok: true });
}

















