import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(_req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("sla_policies")
      .select("*")
      .eq("campaign_id", params.campaignId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const service = createServiceClient();

    const coerce = (value: any, fallback: number) => {
      if (value === null || value === undefined || value === "") {
        return fallback;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(0, Math.round(parsed));
    };

    const payload = {
      campaign_id: params.campaignId,
      question_hours: coerce(body.question_hours, 2),
      positive_hours: coerce(body.positive_hours, 2),
      neutral_hours: coerce(body.neutral_hours, 8),
      negative_hours: coerce(body.negative_hours, 0),
      ooo_hours: coerce(body.ooo_hours, 0),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await service
      .from("sla_policies")
      .upsert(payload, { onConflict: "campaign_id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


