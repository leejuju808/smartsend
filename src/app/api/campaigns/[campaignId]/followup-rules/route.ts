import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase";

const RuleSchema = z.object({
  enabled: z.boolean(),
  labels: z.array(z.enum(["question", "neutral"])).default(["question", "neutral"]),
  hours_wait: z.number().int().min(1).max(336).default(48),
  max_nudges: z.number().int().min(1).max(5).default(2),
  tone: z.enum(["warm", "concise", "professional"]).default("warm"),
  auto_send: z.boolean().default(false),
  subject_template: z.string().min(1).max(200).default("Quick follow-up"),
  body_html_template: z
    .string()
    .min(1)
    .max(8000)
    .default("<p>Just circling back—happy to keep this simple. Would a quick chat help?</p>"),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("followup_rules")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    data ?? {
      campaign_id: params.campaignId,
      enabled: false,
      labels: ["question", "neutral"],
      hours_wait: 48,
      max_nudges: 2,
      tone: "warm",
      auto_send: false,
      subject_template: "Quick follow-up",
      body_html_template: "<p>Just circling back—happy to keep this simple. Would a quick chat help?</p>",
    }
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  // enforce collaborator permissions
  const { requireEditor } = await import("@/lib/permissions/campaign");
  const check = await requireEditor(params.campaignId);
  if (!check.allowed) return check.response;

  const body = await req.json();
  const parsed = RuleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = {
    campaign_id: params.campaignId,
    labels: parsed.data.labels,
    hours_wait: parsed.data.hours_wait,
    max_nudges: parsed.data.max_nudges,
    auto_send: parsed.data.auto_send,
    tone: parsed.data.tone,
    enabled: parsed.data.enabled,
    subject_template: parsed.data.subject_template,
    body_html_template: parsed.data.body_html_template,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("followup_rules")
    .upsert(payload, { onConflict: "campaign_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


