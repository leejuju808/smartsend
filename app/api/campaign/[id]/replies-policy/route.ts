import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const DEFAULT_REPLY_POLICY = {
  auto_mark_replied: true,
  reply_labels: ["human_reply", "question", "positive", "neutral", "routing"],
  hours_wait: 48,
  max_nudges: 2,
  auto_send: false,
  tone: "professional",
} as const;

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("followup_rules")
    .select(
      "auto_mark_replied, reply_labels, hours_wait, max_nudges, auto_send, tone"
    )
    .eq("campaign_id", params.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    policy: data ?? DEFAULT_REPLY_POLICY,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));

  const replyLabels =
    Array.isArray(body.reply_labels) && body.reply_labels.length
      ? body.reply_labels
      : DEFAULT_REPLY_POLICY.reply_labels;

  const up = {
    campaign_id: params.id,
    auto_mark_replied:
      body.auto_mark_replied ?? DEFAULT_REPLY_POLICY.auto_mark_replied,
    reply_labels: replyLabels,
  };

  const { data, error } = await supabase
    .from("followup_rules")
    .upsert(up, { onConflict: "campaign_id" })
    .select("auto_mark_replied, reply_labels")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ policy: data });
}

