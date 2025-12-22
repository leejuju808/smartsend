import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { notifyWebhooks } from "@/lib/webhooks";

export async function POST(_: NextRequest, { params }: { params: { campaignId: string; id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: evt, error } = await supabase
    .from("campaign_events")
    .select("id,created_at,campaign_id,type,actor_user_id,target_user_id,invite_id,meta")
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !evt) {
    return NextResponse.json({ error: "no_events" }, { status: 404 });
  }

  await admin.from("webhook_deliveries").insert({
    webhook_id: params.id,
    campaign_id: params.campaignId,
    event_id: evt.id,
    attempt: 1,
    status: "queued",
    next_attempt_at: new Date().toISOString(),
  });

  await notifyWebhooks(evt as any);

  return NextResponse.json({ ok: true, event_id: evt.id });
}




