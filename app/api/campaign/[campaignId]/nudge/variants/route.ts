import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("nudge_variants")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .order("scenario", { ascending: true })
    .order("tone", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, variants: data });
}

export async function POST(req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = (await req.json().catch(() => ({}))) as Record<string, any>;

  const row = {
    campaign_id: params.campaignId,
    scenario: typeof body.scenario === "string" && body.scenario.length > 0 ? body.scenario : "no_reply",
    tone: typeof body.tone === "string" && body.tone.length > 0 ? body.tone : "professional",
    name: typeof body.name === "string" && body.name.length > 0 ? body.name : "Untitled",
    subject: typeof body.subject === "string" ? body.subject : "",
    body: typeof body.body === "string" ? body.body : "",
    weight: typeof body.weight === "number" && Number.isFinite(body.weight) ? body.weight : 1.0,
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
  };

  const { data, error } = await supabase.from("nudge_variants").insert(row).select().single();

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, variant: data });
}


