import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

type EventPayload = {
  id: string;
  campaign_id: string;
  created_at: string;
  type:
    | "invite_created"
    | "invite_canceled"
    | "invite_accepted"
    | "member_role_changed"
    | "member_removed";
  actor_user_id: string | null;
  target_user_id: string | null;
  invite_id: string | null;
  meta: Record<string, any>;
};

type HookRecord = {
  id: string;
  url: string;
  secret: string | null;
  enabled?: boolean;
};

type DeliveryRecord = {
  id: string;
  webhook_id: string;
  attempt: number;
};

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const isSlack = (url: string) => url.includes("hooks.slack.com");

export async function notifyWebhooks(evt: EventPayload) {
  const { data: hooks, error: hookError } = await admin.rpc("get_event_webhooks", {
    p_campaign: evt.campaign_id,
    p_type: evt.type,
  });

  if (hookError) {
    console.error("notifyWebhooks: failed to load webhooks", hookError);
    return;
  }

  if (!hooks?.length) {
    return;
  }

  const { error: queueError } = await admin.rpc("queue_webhook_deliveries", {
    p_campaign: evt.campaign_id,
    p_event: evt.id,
  });

  if (queueError) {
    console.error("notifyWebhooks: failed to queue deliveries", queueError);
    return;
  }

  const { data: queued, error: queuedError } = await admin
    .from("webhook_deliveries")
    .select("id,webhook_id,attempt")
    .eq("event_id", evt.id)
    .order("created_at", { ascending: false });

  if (queuedError) {
    console.error("notifyWebhooks: failed to load queued deliveries", queuedError);
    return;
  }

  await Promise.allSettled(
    (queued ?? []).map(async (row: DeliveryRecord) => {
      const hook = (hooks as HookRecord[]).find((h) => h.id === row.webhook_id);
      if (!hook) {
        return;
      }

      const payload = isSlack(hook.url)
        ? {
            text: `*${evt.type}* • ${evt.campaign_id}\n\`\`\`${JSON.stringify(evt.meta || {}, null, 2)}\`\`\``,
          }
        : evt;

      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Smartsend-Event": evt.type,
        "X-Smartsend-Id": evt.id,
      };

      if (hook.secret) {
        const sig = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
        headers["X-Smartsend-Signature"] = `sha256=${sig}`;
      }

      const started = Date.now();

      try {
        const res = await fetch(hook.url, { method: "POST", headers, body });
        const ms = Date.now() - started;

        if (res.ok) {
          await admin
            .from("webhook_deliveries")
            .update({
              status: "success",
              response_status: res.status,
              response_ms: ms,
              request_body: evt,
              next_attempt_at: null,
            })
            .eq("id", row.id);
        } else {
          await admin
            .from("webhook_deliveries")
            .update({
              status: "failed",
              response_status: res.status,
              response_ms: ms,
              error: `HTTP ${res.status}`,
              request_body: evt,
              next_attempt_at: new Date(Date.now() + publicBackoffMs(row.attempt)).toISOString(),
            })
            .eq("id", row.id);
        }
      } catch (err: any) {
        const ms = Date.now() - started;
        await admin
          .from("webhook_deliveries")
          .update({
            status: "failed",
            response_status: null,
            response_ms: ms,
            error: err?.message ?? "network_error",
            request_body: evt,
            next_attempt_at: new Date(Date.now() + publicBackoffMs(row.attempt)).toISOString(),
          })
          .eq("id", row.id);
      }
    }),
  );
}

export async function dispatchCampaignWebhooks(campaignId: string) {
  const { data: evt, error } = await admin
    .from("campaign_events")
    .select("id,created_at,campaign_id,type,actor_user_id,target_user_id,invite_id,meta")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error("dispatchCampaignWebhooks: failed to load event", error);
    return;
  }

  if (evt) {
    await notifyWebhooks(evt as EventPayload);
  }
}

function publicBackoffMs(attempt: number) {
  return (
    attempt <= 1 ? 1 : attempt === 2 ? 5 : attempt === 3 ? 15 : attempt === 4 ? 60 : attempt === 5 ? 180 : 720
  ) * 60 * 1000;
}
