import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { supabaseAdmin } from "@/lib/supabase/admin";

const LABEL_WHITELIST = new Set(["question", "neutral"]);
const TONE_WHITELIST = new Set(["warm", "concise", "professional"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;
  if (!campaignId) {
    return NextResponse.json({ error: "campaign id required" }, { status: 400 });
  }

  // enforce collaborator permissions
  const { requireEditor } = await import("@/lib/permissions/campaign");
  const check = await requireEditor(campaignId);
  if (!check.allowed) return check.response;

  const supabase = createRouteHandlerClient({ cookies });

  let body: any = null;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const labelsInput: string[] = Array.isArray(body?.labels) ? body.labels : [];
  const filteredLabels = labelsInput.filter((value) => LABEL_WHITELIST.has(value));
  const labels = filteredLabels.length ? filteredLabels : ["question", "neutral"];

  const hoursRaw = Number(body?.hours_wait);
  const maxRaw = Number(body?.max_nudges);
  const hours_wait = Number.isFinite(hoursRaw) ? Math.max(1, Math.round(hoursRaw)) : 48;
  const max_nudges = Number.isFinite(maxRaw) ? Math.max(1, Math.round(maxRaw)) : 2;
  const tone = typeof body?.tone === "string" && TONE_WHITELIST.has(body.tone)
    ? (body.tone as string)
    : "warm";
  const enabled = body?.enabled !== false;
  const auto_send = body?.auto_send === true;

  const payload = {
    campaign_id: campaignId,
    labels,
    hours_wait,
    max_nudges,
    tone,
    enabled,
    auto_send,
  };

  const { data, error } = await supabaseAdmin
    .from("followup_rules")
    .upsert(payload, { onConflict: "campaign_id" })
    .select("campaign_id, labels, hours_wait, max_nudges, auto_send, tone, enabled")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, rule: data ?? payload });
}





