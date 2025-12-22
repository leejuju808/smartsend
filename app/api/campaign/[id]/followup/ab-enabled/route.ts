import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: rule, error } = await supabase
    .from("followup_rules")
    .select("ab_enabled")
    .eq("campaign_id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ab_enabled: !!rule?.ab_enabled });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { ab_enabled } = await req.json().catch(() => ({}));

  const { error } = await supabase
    .from("followup_rules")
    .upsert({ campaign_id: params.id, ab_enabled: !!ab_enabled }, { onConflict: "campaign_id" });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

