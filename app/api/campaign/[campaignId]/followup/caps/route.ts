import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("followup_caps")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .order("scenario")
    .order("tone");

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, caps: data });
}

export async function PATCH(req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({ caps: [] }));
  const caps = Array.isArray((body as any).caps) ? (body as any).caps : [];

  const rows = caps
    .map((cap: any) => {
      const num = Number(cap?.daily_cap);
      const dailyCap = Number.isFinite(num) ? Math.max(0, Math.floor(num)) : null;
      if (!dailyCap) return null;
      return {
        campaign_id: params.campaignId,
        scenario: String(cap?.scenario ?? ""),
        tone: String(cap?.tone ?? ""),
        daily_cap: dailyCap,
      };
    })
    .filter(Boolean) as Array<{ campaign_id: string; scenario: string; tone: string; daily_cap: number }>;

  const { error: delError } = await supabase.from("followup_caps").delete().eq("campaign_id", params.campaignId);

  if (delError) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  if (rows.length) {
    const { error } = await supabase.from("followup_caps").upsert(rows, { onConflict: "campaign_id,scenario,tone" });

    if (error) {
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}


