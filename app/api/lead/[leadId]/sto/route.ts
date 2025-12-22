import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { nextAtHour } from "@/lib/sto";

const Body = z.object({
  tz: z.string().optional(),
  reset: z.boolean().optional(),
  useNext: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const campaignId = new URL(req.url).searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("lead_sto_profiles")
    .select(
      "best_hour,best_hour_conf,hist_opens,hist_clicks,updated_at,tz,last_observed_at"
    )
    .eq("campaign_id", campaignId)
    .eq("lead_id", params.leadId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const campaignId = new URL(req.url).searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  const { data: lead } = await supabase
    .from("campaign_leads")
    .select("id, timezone")
    .eq("id", params.leadId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("default_tz")
    .eq("id", campaignId)
    .maybeSingle();

  if (payload.reset) {
    await supabase
      .from("lead_sto_profiles")
      .update({
        hist_opens: new Array(24).fill(0),
        hist_clicks: new Array(24).fill(0),
        best_hour: null,
        best_hour_conf: 0,
        last_observed_at: null,
      })
      .eq("campaign_id", campaignId)
      .eq("lead_id", params.leadId);
  }

  if (payload.tz) {
    await supabase
      .from("lead_sto_profiles")
      .upsert(
        {
          campaign_id: campaignId,
          lead_id: params.leadId,
          tz: payload.tz,
        },
        { onConflict: "campaign_id,lead_id" }
      );
  }

  if (payload.useNext) {
    const { data: profile } = await supabase
      .from("lead_sto_profiles")
      .select("id,best_hour,best_hour_conf,tz")
      .eq("campaign_id", campaignId)
      .eq("lead_id", params.leadId)
      .maybeSingle();

    if (
      profile?.best_hour != null &&
      (profile.best_hour_conf ?? 0) >= 0.2
    ) {
      const tz =
        payload.tz ??
        profile?.tz ??
        lead?.timezone ??
        campaign?.default_tz ??
        "America/Los_Angeles";

      let candidate = nextAtHour(tz, profile.best_hour);
      const now = new Date();
      while (candidate < now) {
        candidate = new Date(candidate.getTime() + 86_400_000);
      }

      const { data: queued } = await supabase
        .from("send_queue")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("lead_id", params.leadId)
        .in("status", ["queued", "scheduled"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (queued?.id) {
        await supabase
          .from("send_queue")
          .update({
            scheduled_at: candidate.toISOString(),
            status: "scheduled",
          })
          .eq("id", queued.id);
      }
    }
  }

  const { data, error } = await supabase
    .from("lead_sto_profiles")
    .select(
      "best_hour,best_hour_conf,hist_opens,hist_clicks,updated_at,tz,last_observed_at"
    )
    .eq("campaign_id", campaignId)
    .eq("lead_id", params.leadId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

