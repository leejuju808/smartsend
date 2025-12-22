import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertViewer, assertEditor } from "@/lib/acl";

function assertCampaignId(campaignId: string) {
  if (!campaignId) {
    throw new Response(JSON.stringify({ error: "bad_request" }), { status: 400 });
  }
}

const Body = z.object({
  enabled: z.boolean().optional(),
  window_days: z.number().int().min(3).max(30).optional(),
  min_sends: z.number().int().min(10).max(10000).optional(),
  max_bounce_rate: z.number().min(0).max(1).optional(),
  min_open_rate: z.number().min(0).max(1).optional(),
  min_reply_rate: z.number().min(0).max(1).optional(),
  action_on_variant: z.enum(["pause", "warn"]).optional(),
  action_on_step: z.enum(["pause", "warn", "none"]).optional(),
  action_on_account: z.enum(["pause", "warn", "none"]).optional(),
  cool_hours: z.number().int().min(1).max(72).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  try {
    assertCampaignId(params.campaignId);
    await assertViewer(params.campaignId);

    const supabase = createRouteHandlerClient({ cookies });
    const { data, error } = await supabase
      .from("deliverability_rules")
      .select("*")
      .eq("campaign_id", params.campaignId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: events, error: eventsError } = await supabase
      .from("deliverability_events")
      .select("id,created_at,entity_type,entity_id,level,reason,metrics")
      .eq("campaign_id", params.campaignId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    return NextResponse.json({
      item: data ?? {
        campaign_id: params.campaignId,
        enabled: true,
        window_days: 7,
        min_sends: 50,
        max_bounce_rate: 0.08,
        min_open_rate: 0.1,
        min_reply_rate: 0.005,
        action_on_variant: "pause",
        action_on_step: "warn",
        action_on_account: "warn",
        cool_hours: 12,
      },
      events: events ?? [],
    });
  } catch (err: unknown) {
    if (err instanceof Response) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  try {
    assertCampaignId(params.campaignId);
    await assertEditor(params.campaignId);

    const supabase = createRouteHandlerClient({ cookies });
    const payload = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("deliverability_rules")
      .upsert(
        { campaign_id: params.campaignId, ...parsed.data },
        { onConflict: "campaign_id" },
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (err: unknown) {
    if (err instanceof Response) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

