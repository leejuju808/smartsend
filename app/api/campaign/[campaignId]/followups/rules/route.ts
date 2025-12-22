import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { assertViewer, assertEditor } from "@/lib/acl";

const Body = z
  .object({
    labels: z.array(z.string()).min(1),
    hours_wait: z.number().int().min(0).max(720),
    max_nudges: z.number().int().min(0).max(10),
    auto_send: z.boolean(),
    tone: z.enum(["friendly", "professional", "concise", "assertive", "warm", "casual"]),
    length: z.enum(["short", "medium", "long"]),
    auto_optimize: z.boolean(),
    min_hours_wait: z.number().int().min(1).max(720),
    max_hours_wait: z.number().int().min(1).max(720),
    step_hours: z.number().int().min(1).max(168),
    max_nudges_min: z.number().int().min(0).max(10),
    max_nudges_max: z.number().int().min(0).max(10),
    tone_pool: z.array(z.string()).min(1).max(10),
  })
  .superRefine((data, ctx) => {
    if (data.max_hours_wait < data.min_hours_wait) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "max_hours_wait must be greater than or equal to min_hours_wait",
        path: ["max_hours_wait"],
      });
    }
    if (data.max_nudges_max < data.max_nudges_min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "max_nudges_max must be greater than or equal to max_nudges_min",
        path: ["max_nudges_max"],
      });
    }
  });

const DEFAULT_RULE = {
  labels: ["human_reply", "question", "positive", "neutral", "routing"],
  hours_wait: 48,
  max_nudges: 2,
  auto_send: false,
  tone: "professional",
  length: "short",
  auto_optimize: false,
  min_hours_wait: 12,
  max_hours_wait: 72,
  step_hours: 6,
  max_nudges_min: 1,
  max_nudges_max: 4,
  tone_pool: ["professional", "friendly", "concise"],
} as const;

export async function GET(_req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("followup_rules")
    .select(
      "labels,hours_wait,max_nudges,auto_send,tone,length,auto_optimize,min_hours_wait,max_hours_wait,step_hours,max_nudges_min,max_nudges_max,tone_pool,last_optimized_at,optimization_notes",
    )
    .eq("campaign_id", params.campaignId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? DEFAULT_RULE });
}

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertEditor(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from("followup_rules")
    .upsert(
      {
        campaign_id: params.campaignId,
        ...parsed.data,
      },
      { onConflict: "campaign_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



