import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const Body = z
  .object({
    duration_min: z.number().int().min(15).max(180).optional(),
    tz: z.string().min(1).optional(), // IANA TZ
    workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
    start_hour: z.number().int().min(0).max(23).optional(),
    end_hour: z.number().int().min(0).max(23).optional(),
    buffer_min: z.number().int().min(0).max(240).optional(),
    location: z.string().max(200).optional(),
    booking_link: z.string().url().max(500).nullable().optional(),
    auto_insert_suggestions: z.boolean().optional(),
    suggestion_template: z.string().max(4000).nullable().optional(),
    auto_book_links: z.boolean().optional(),
    confirmation_template: z.string().max(6000).nullable().optional(),
  })
  .strict();

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("meeting_prefs")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If not seeded yet, client can show defaults
  return NextResponse.json({ item: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const p = parsed.data;

  // Ensure start < end if both present
  if (p.start_hour != null && p.end_hour != null && p.start_hour >= p.end_hour) {
    return NextResponse.json(
      { error: "start_hour_must_be_less_than_end_hour" },
      { status: 400 },
    );
  }

  // Upsert (RLS: editors only; you already set policies)
  const payload = {
    campaign_id: params.campaignId,
    ...p,
    auto_insert_suggestions: p.auto_insert_suggestions,
    suggestion_template: p.suggestion_template ?? null,
    confirmation_template: p.confirmation_template ?? null,
  };

  const { data, error } = await supabase
    .from("meeting_prefs")
    .upsert(
      {
        ...payload,
      },
      { onConflict: "campaign_id" },
    )
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}


