import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  enabled: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
  hours_wait: z.number().min(1).max(240).optional(),
  max_nudges: z.number().min(0).max(10).optional(),
  auto_send: z.boolean().optional(),
  tone: z.enum(["friendly", "professional", "concise", "assertive", "warm"]).optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  cta: z.string().max(160).optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("followup_rules")
    .select("*")
    .eq("campaign_id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data ?? null });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const up = { campaign_id: params.id, ...parsed.data };
  const { data, error } = await supabase
    .from("followup_rules")
    .upsert(up, { onConflict: "campaign_id" })
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rule: data });
}


