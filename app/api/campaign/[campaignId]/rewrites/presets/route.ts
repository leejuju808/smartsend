import { NextRequest, NextResponse } from "next/server";

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Upsert = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  tone: z
    .enum(["friendly", "professional", "concise", "assertive", "playful"])
    .default("professional"),
  length: z.enum(["short", "medium", "long"]).default("short"),
  reading_level: z
    .enum(["grade6", "grade8", "grade10", "business"])
    .default("grade8"),
  cta: z.string().optional().nullable(),
  avoid_phrases: z.array(z.string()).default([]),
  signoff: z.string().optional().nullable(),
  variables: z.record(z.string()).default({}),
});

export async function GET(_: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("rewrite_presets")
    .select(
      "id,created_at,name,tone,length,reading_level,cta,avoid_phrases,signoff,variables",
    )
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ presets: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Upsert.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const me = await supabase.auth.getUser();
  if (!me.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const row = {
    ...parsed.data,
    user_id: me.data.user.id,
    campaign_id: params.campaignId,
  };

  const { data, error } = await supabase
    .from("rewrite_presets")
    .upsert(row as any, { onConflict: "id" })
    .select(
      "id,created_at,name,tone,length,reading_level,cta,avoid_phrases,signoff,variables",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preset: data });
}




