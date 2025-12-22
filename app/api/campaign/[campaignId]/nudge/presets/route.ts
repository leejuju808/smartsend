import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("nudge_presets")
    .select("id,name,scenario,tone,subject,body,is_active,sort_order")
    .eq("campaign_id", params.campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, presets: data });
}

export async function POST(req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));

  const row = {
    campaign_id: params.campaignId,
    name: body.name || "New preset",
    scenario: body.scenario || "no_reply",
    tone: body.tone || "professional",
    subject: body.subject || "",
    body: body.body || "Hi {lead_first} — {cta}",
    is_active: body.is_active ?? true,
    sort_order: Number(body.sort_order ?? 9999),
  };

  const { data, error } = await supabase.from("nudge_presets").insert(row).select().single();

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preset: data });
}


