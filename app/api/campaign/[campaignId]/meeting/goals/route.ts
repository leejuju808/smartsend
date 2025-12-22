import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const Body = z.object({
  intent_to_booked_target: z.number().min(0).max(100),
  median_book_time_target: z.number().min(3600).max(604800),
  alert_recipients: z.array(z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("meeting_goals")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || {});
}

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const payload = {
    campaign_id: params.campaignId,
    intent_to_booked_target: parsed.data.intent_to_booked_target,
    median_book_time_target: parsed.data.median_book_time_target,
    alert_recipients: parsed.data.alert_recipients ?? [],
  };

  const { error } = await supabase
    .from("meeting_goals")
    .upsert(payload, { onConflict: "campaign_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

