import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Patch = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["send", "followup_send"]),
      window: z.enum(["minute", "hour", "day"]),
      limit_count: z.number().int().positive(),
    })
  ),
});

export async function GET(_: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const [cfg, usage] = await Promise.all([
    supabase
      .from("campaign_quota")
      .select("kind,window,limit_count")
      .eq("campaign_id", params.campaignId),
    supabase.rpc("quota_snapshot", { p_campaign: params.campaignId }).then((r) => ({
      data: r.data,
      error: r.error,
    })),
  ]);

  if (cfg.error) {
    return NextResponse.json({ error: cfg.error.message }, { status: 500 });
  }
  if (usage.error) {
    return NextResponse.json({ error: usage.error.message }, { status: 500 });
  }

  return NextResponse.json({ config: cfg.data ?? [], usage: usage.data ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  for (const it of parsed.data.items) {
    const { error } = await supabase.from("campaign_quota").upsert({
      campaign_id: params.campaignId,
      kind: it.kind,
      window: it.window,
      limit_count: it.limit_count,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}




