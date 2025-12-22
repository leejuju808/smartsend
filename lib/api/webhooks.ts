// Webhook signature signing and delivery

import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Sign webhook payload with HMAC-SHA256
 */
export function signWebhookPayload(payload: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${signature}`;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = signWebhookPayload(payload, secret);
  return signature === expectedSignature;
}

/**
 * Deliver webhook to endpoint
 */
export async function deliverWebhook(
  url: string,
  event: string,
  payload: any,
  secret: string
): Promise<boolean> {
  const payloadString = JSON.stringify(payload);
  const signature = signWebhookPayload(payloadString, secret);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-smartsend-signature": signature,
        "x-smartsend-event": event,
      },
      body: payloadString,
    });

    return response.ok;
  } catch (error) {
    console.error("Webhook delivery error:", error);
    return false;
  }
}

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(
  workspaceId: string,
  event: string,
  payload: any
): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get active webhooks for this event
  const { data: webhooks } = await supabase
    .from("webhooks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("event", event)
    .eq("active", true);

  if (!webhooks || webhooks.length === 0) {
    return;
  }

  // Log webhook delivery attempts
  const deliveryPromises = webhooks.map(async (webhook) => {
    // Insert delivery record
    const { data: delivery } = await supabase
      .from("webhook_deliveries")
      .insert({
        webhook_id: webhook.id,
        event,
        payload,
        status: "pending",
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Deliver webhook
    try {
      const success = await deliverWebhook(webhook.url, event, payload, webhook.secret);
      
      // Update delivery record
      await supabase
        .from("webhook_deliveries")
        .update({
          status: success ? "success" : "failed",
          response_code: success ? 200 : 500,
        })
        .eq("id", delivery?.id);

      return success;
    } catch (error: any) {
      // Update delivery record with error
      await supabase
        .from("webhook_deliveries")
        .update({
          status: "failed",
          response_code: error.status || 500,
          response_body: error.message?.substring(0, 1000),
        })
        .eq("id", delivery?.id);

      console.error(`Webhook delivery failed for ${webhook.url}:`, error);
      return false;
    }
  });

  await Promise.allSettled(deliveryPromises);
}



