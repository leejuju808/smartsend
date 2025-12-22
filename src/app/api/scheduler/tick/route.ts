import { assertCampaignKey } from "@/lib/campaignKey";
import { createClient } from "@supabase/supabase-js";

type Claimed = { id: string; lead_id: string; account_id: string | null; step_no: number | null; scheduled_at: string };

export async function POST(req: Request) {
  try {
    const campaignId = await assertCampaignKey(req, "queue:write"); // throws on fail

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: planOk, error: planErr } = await admin.rpc("can_send_under_plan", { p_campaign: campaignId });
    if (planErr) {
      return new Response(planErr.message ?? "Plan check failed", { status: 400 });
    }

    if (planOk !== true) {
      return new Response(JSON.stringify({ ok: false, error: "Monthly send limit reached. Upgrade to send more." }), {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }

    // 1) Requeue stale locks (optional safety)
    await admin.rpc("requeue_stale_sending", { p_campaign: campaignId }).catch(() => {});

    // 2) Claim due
    const workerId = `tick-${crypto.randomUUID()}`;
    const { data: claimed, error: claimErr } = await admin.rpc("claim_due_queue", {
      p_campaign: campaignId,
      p_worker: workerId,
      p_now: new Date().toISOString(),
      p_max: 25,
    });

    if (claimErr) return new Response(claimErr.message, { status: 400 });
    const batch: Claimed[] = Array.isArray(claimed) ? claimed : [];

    // Nothing due
    if (batch.length === 0)
      return new Response(JSON.stringify({ claimed: 0, sent: 0, failed: 0 }), {
        headers: { "content-type": "application/json" },
      });

    let sent = 0,
      failed = 0;

    // 3) Deliver each (plug your real sender here)
    for (const q of batch) {
      try {
        // TODO: render subject/body, resolve from variants, etc.
        // TODO: choose connected account (q.account_id) + send via Gmail/Outlook.
        // For now, simulate success:
        const simulatedMessageId = `msg_${q.id.slice(0, 8)}_${Date.now()}`;

        const { error: doneErr } = await admin.rpc("complete_queue_item", {
          p_queue: q.id,
          p_campaign: campaignId,
          p_success: true,
          p_message_id: simulatedMessageId,
          p_thread_id: null,
          p_error: null,
        });
        if (doneErr) throw new Error(doneErr.message);
        sent++;
      } catch (e: any) {
        failed++;
        await admin
          .rpc("complete_queue_item", {
            p_queue: q.id,
            p_campaign: campaignId,
            p_success: false,
            p_message_id: null,
            p_thread_id: null,
            p_error: String(e?.message || e || "send_failed"),
          })
          .catch(() => {});
      }
    }

    return new Response(JSON.stringify({ claimed: batch.length, sent, failed }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: e?.message?.includes("Missing") || e?.message?.includes("Invalid") ? 401 : 500,
      headers: { "content-type": "application/json" },
    });
  }
}
