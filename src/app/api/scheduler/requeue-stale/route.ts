import { assertCampaignKey } from "@/lib/campaignKey";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const campaignId = await assertCampaignKey(req, "queue:write");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await admin.rpc("requeue_stale_sending", {
      p_campaign: campaignId,
    });
    if (error) return new Response(error.message, { status: 400 });
    return new Response(JSON.stringify({ requeued: data ?? 0 }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: e?.message?.includes("Missing") || e?.message?.includes("Invalid") ? 401 : 500,
      headers: { "content-type": "application/json" },
    });
  }
}

