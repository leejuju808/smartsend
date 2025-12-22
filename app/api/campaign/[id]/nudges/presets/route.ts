import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const campaignId = params.id;
  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "campaign_required" }, { status: 400 });
  }

  const [scenarios, tones] = await Promise.all([
    supabase
      .from("nudge_scenario_presets")
      .select("key,label,sort,is_active,campaign_id")
      .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
      .order("campaign_id", { ascending: false })
      .order("sort", { ascending: true }),
    supabase
      .from("nudge_tone_presets")
      .select("key,label,sort,is_active,campaign_id")
      .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
      .order("campaign_id", { ascending: false })
      .order("sort", { ascending: true }),
  ]);

  const pickLatest = (rows: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const row of rows ?? []) {
      if (!seen.has(row.key) && row.is_active) {
        seen.add(row.key);
        out.push(row);
      }
    }
    return out;
  };

  if (scenarios.error) {
    return NextResponse.json({ ok: false, error: scenarios.error.message }, { status: 400 });
  }

  if (tones.error) {
    return NextResponse.json({ ok: false, error: tones.error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    scenarios: pickLatest(scenarios.data ?? []),
    tones: pickLatest(tones.data ?? []),
  });
}


