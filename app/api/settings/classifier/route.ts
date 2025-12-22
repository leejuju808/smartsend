import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const campaignId = process.env.NEXT_PUBLIC_CAMPAIGN_ID;

  if (!url || !serviceKey || !campaignId) {
    throw new Error("missing_supabase_config");
  }

  return { url, serviceKey, campaignId };
}

export async function GET() {
  try {
    const { url, serviceKey, campaignId } = getConfig();
    const supabase = createClient(url, serviceKey);

    const { error: ensureError } = await supabase.rpc("ensure_classifier_settings", { p_campaign: campaignId });
    if (ensureError) {
      return NextResponse.json({ error: ensureError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("classifier_settings")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? {});
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, serviceKey, campaignId } = getConfig();
    const supabase = createClient(url, serviceKey);

    const { data, error } = await supabase
      .from("classifier_settings")
      .upsert({ campaign_id: campaignId, ...body, updated_at: new Date().toISOString() })
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? {});
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 },
    );
  }
}


