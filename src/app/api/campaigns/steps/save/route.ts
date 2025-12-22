import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { campaignId, steps } = await req.json();
    if (!campaignId || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "campaignId and steps[] required" }, { status: 400 });
    }

    const sb = createClient(url, service, { auth: { persistSession: false } });

    const { error: delErr } = await sb.from("campaign_steps").delete().eq("campaign_id", campaignId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const payload = steps.map((s: any, i: number) => ({
      campaign_id: campaignId,
      step_no: i + 1,
      label: s.label ?? defaultLabel(i),
      delay_hours: Number(s.delay_hours ?? defaultDelay(i)),
      subject: String(s.subject || "").slice(0, 200),
      body: String(s.body || ""),
      settings: s.settings ?? { purpose: s.purpose ?? purposeFor(i) }
    }));

    const { error } = await sb.from("campaign_steps").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: payload.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Save failed" }, { status: 500 });
  }
}

function defaultLabel(i: number) {
  return ["Intro", "Follow-up 1", "Follow-up 2", "Follow-up 3", "Breakup"][i] || `Step ${i + 1}`;
}
function defaultDelay(i: number) {
  return [0, 48, 96, 168, 240][i] ?? i * 48;
}
function purposeFor(i: number) {
  return ["cold_outreach", "follow_up", "follow_up", "follow_up", "breakup"][i] || "follow_up";
}


