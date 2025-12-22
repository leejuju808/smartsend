import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  days_allowed: z.array(z.number().int().min(0).max(6)).optional(),
  hour_start: z.number().int().min(0).max(23).optional(),
  hour_end: z.number().int().min(1).max(24).optional(),
  block_holidays: z.boolean().optional(),
  tz_source: z.enum(["lead", "campaign"]).optional(),
  campaign_tz: z.string().optional().nullable(),
  campaign_country: z.string().length(2).optional().nullable(),
  min_gap_minutes: z.number().int().min(0).max(1440).optional(),
});

export async function GET(_: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("campaign_send_policy")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ policy: data });
}

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const campaignId = params.campaignId;

  const daysAllowed = data.days_allowed
    ? Array.from(new Set(data.days_allowed)).sort((a, b) => a - b)
    : undefined;

  if (daysAllowed !== undefined && daysAllowed.length === 0) {
    return NextResponse.json({ error: "days_allowed must include at least one day" }, { status: 400 });
  }

  if (
    data.hour_start !== undefined &&
    data.hour_end !== undefined &&
    data.hour_start >= data.hour_end
  ) {
    return NextResponse.json(
      { error: "hour_end must be greater than hour_start" },
      { status: 400 },
    );
  }

  const { data: isEditor, error: editorError } = await supabase.rpc("is_campaign_editor", {
    p_campaign: campaignId,
  });

  if (editorError) {
    return NextResponse.json({ error: editorError.message }, { status: 500 });
  }

  if (!isEditor) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const payload: Record<string, unknown> = {
    campaign_id: campaignId,
  };

  if (daysAllowed !== undefined) payload.days_allowed = daysAllowed;
  if (data.hour_start !== undefined) payload.hour_start = data.hour_start;
  if (data.hour_end !== undefined) payload.hour_end = data.hour_end;
  if (data.block_holidays !== undefined) payload.block_holidays = data.block_holidays;
  if (data.min_gap_minutes !== undefined) payload.min_gap_minutes = data.min_gap_minutes;
  if (data.tz_source !== undefined) payload.tz_source = data.tz_source;

  const tzSource = (payload.tz_source ?? data.tz_source) as "lead" | "campaign" | undefined;

  if (tzSource === "campaign") {
    payload.campaign_tz = data.campaign_tz ?? null;
    payload.campaign_country = data.campaign_country
      ? data.campaign_country.toUpperCase()
      : null;
  } else {
    if (data.campaign_tz !== undefined || tzSource === "lead") {
      payload.campaign_tz = null;
    }
    if (data.campaign_country !== undefined || tzSource === "lead") {
      payload.campaign_country = null;
    }
  }

  const { error } = await supabase
    .from("campaign_send_policy")
    .upsert(payload, { onConflict: "campaign_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


