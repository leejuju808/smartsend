import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  scenario: z
    .enum(["no_reply", "question", "positive", "neutral", "routing"])
    .default("no_reply"),
  tone: z
    .enum([
      "professional",
      "friendly",
      "concise",
      "assertive",
      "curious",
      "warm",
      "direct",
      "playful",
    ])
    .default("professional"),
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  weight: z.number().min(0.1).max(10).default(1),
});

export async function POST(req: Request, { params }: { params: { stepId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
  }

  const { subject, body, tone, name, weight, scenario } = parsed.data;

  const stepId = params.stepId;
  const { data: step, error: stepError } = await supabase
    .from("campaign_steps")
    .select("id, campaign_id")
    .eq("id", stepId)
    .maybeSingle();

  if (stepError) {
    return NextResponse.json({ ok: false, error: stepError.message }, { status: 500 });
  }

  if (!step) {
    return NextResponse.json({ ok: false, error: "Step not found" }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("step_variants").insert({
    step_id: step.id,
    campaign_id: step.campaign_id,
    scenario,
    tone,
    name,
    subject,
    body,
    weight,
    is_active: true,
  } as any);

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}




