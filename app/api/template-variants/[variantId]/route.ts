import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
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

  const { data: variant, error } = await supabase
    .from("followup_template_variants")
    .select(
      "id, base_template_id, campaign_id, tone, status, subject, body, quality_score, created_at, created_by, approved_at, approved_by",
    )
    .eq("id", params.variantId)
    .single();

  if (error || !variant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(variant);
}

















