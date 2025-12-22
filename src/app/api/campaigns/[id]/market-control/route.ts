import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params;

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Use RLS-scoped fetch for access control.
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id, market_city, market_state, market_key, sender_account_id, status, org_id")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) {
    return NextResponse.json({ ok: false, error: cErr?.message || "Not found" }, { status: 404 });
  }

  const marketKey = (campaign as any).market_key as string | null;
  const senderAccountId = (campaign as any).sender_account_id as string | null;

  let saturation: any = null;
  if (marketKey) {
    const { data } = await supabaseAdmin
      .from("v_market_saturation")
      .select("market_key, active_roofers, soft_cap_active_roofers, spots_left")
      .eq("market_key", marketKey)
      .maybeSingle();
    saturation = data ?? null;
  }

  let momentum: any = null;
  if (senderAccountId) {
    const { data } = await supabaseAdmin
      .from("v_sender_account_outreach_momentum_30d")
      .select("sender_account_id, sends_30d, replies_30d, replies_per_50, momentum_tier, momentum_badge")
      .eq("sender_account_id", senderAccountId)
      .maybeSingle();
    momentum = data ?? null;
  }

  return NextResponse.json({
    ok: true,
    campaign: {
      id: campaign.id,
      market_city: (campaign as any).market_city ?? null,
      market_state: (campaign as any).market_state ?? null,
      market_key: marketKey,
      sender_account_id: senderAccountId,
    },
    saturation,
    momentum,
  });
}








