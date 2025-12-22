import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const s = createClient();
  const {
    variantId,
    campaignId,
    scenario = "no_reply",
    tone = "concise",
    name,
  } = await req.json();

  const { data: v, error } = await s.from("rewrite_variants").select("subject, body").eq("id", variantId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: ins } = await s.from("nudge_variants").insert({
    campaign_id: campaignId,
    scenario,
    tone,
    name: name ?? `AI ${tone} #${Math.floor(Math.random() * 999)}`,
    subject: v.subject,
    body: v.body,
    weight: 1.0,
    is_active: true,
  });
  if (ins) return NextResponse.json({ error: ins.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}




