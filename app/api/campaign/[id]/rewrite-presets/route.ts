import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Preset = z.object({
  name: z.string().min(2).max(40),
  tone: z.enum(["friendly", "professional", "concise", "assertive", "warm"]),
  length: z.enum(["short", "medium", "long"]),
  cta: z.string().max(200).nullable().optional(),
  variables: z.record(z.string()).optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("rewrite_presets")
    .select("*")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ presets: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const j = await req.json().catch(() => ({}));
  const p = Preset.safeParse(j);
  if (!p.success) {
    return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  }

  const user = await supabase.auth.getUser();
  if (user.error) {
    return NextResponse.json({ error: user.error.message }, { status: 401 });
  }

  const row = {
    campaign_id: params.id,
    user_id: user.data.user?.id,
    ...p.data,
  };
  const { data, error } = await supabase
    .from("rewrite_presets")
    .upsert(row, { onConflict: "user_id,campaign_id,name" })
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, preset: data });
}

