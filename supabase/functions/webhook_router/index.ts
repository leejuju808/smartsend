import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface WebhookPayload {
  service: string;
  event_type: string;
  data: any;
  org_id?: string;
  timestamp?: string;
}

/**
 * AUREV HQ Webhook Router
 * Routes incoming webhooks from partner services to appropriate handlers
 * 
 * Supports: HubSpot, Slack, Zapier, Stripe, Notion, etc.
 */

serve(async (req) => {
  try {
    // Get service from path or header
    const url = new URL(req.url);
    const service = url.pathname.split("/").pop() || req.headers.get("x-service") || "";
    
    if (!service) {
      return new Response(JSON.stringify({ error: "Service not specified" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify webhook signature if available
    const signature = req.headers.get("x-webhook-signature");
    if (signature) {
      const isValid = await verifyWebhookSignature(req, signature, service);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Parse webhook payload
    const body = await req.json();
    const eventType = detectEventType(service, body);

    // Route to appropriate handler
    let result;
    switch (service.toLowerCase()) {
      case "hubspot":
        result = await handleHubSpotWebhook(body, eventType);
        break;
      case "slack":
        result = await handleSlackWebhook(body, eventType);
        break;
      case "zapier":
        result = await handleZapierWebhook(body, eventType);
        break;
      case "stripe":
        result = await handleStripeWebhook(body, eventType);
        break;
      case "notion":
        result = await handleNotionWebhook(body, eventType);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported service: ${service}` }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
    }

    // Log webhook event
    await logWebhookEvent(service, eventType, body);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook router error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Verify webhook signature for security
 */
async function verifyWebhookSignature(
  req: Request,
  signature: string,
  service: string
): Promise<boolean> {
  // TODO: Implement signature verification per service
  // Stripe: stripe.signature
  // HubSpot: hubspot signature
  // Zapier: Zapier signature
  return true; // Placeholder - implement proper verification
}

/**
 * Detect event type from webhook payload
 */
function detectEventType(service: string, body: any): string {
  switch (service.toLowerCase()) {
    case "hubspot":
      return body.subscriptionType || body.eventType || "unknown";
    case "slack":
      return body.type || "unknown";
    case "zapier":
      return body.action || "trigger";
    case "stripe":
      return body.type || "unknown";
    case "notion":
      return "page_updated";
    default:
      return "unknown";
  }
}

/**
 * Handle HubSpot webhooks
 */
async function handleHubSpotWebhook(body: any, eventType: string) {
  console.log(`Processing HubSpot ${eventType} event`);

  // Extract contact/deal data
  if (eventType.includes("contact")) {
    // Sync contact to AUREV
    return { success: true, action: "sync_contact", event: eventType };
  } else if (eventType.includes("deal")) {
    // Sync deal to AUREV
    return { success: true, action: "sync_deal", event: eventType };
  }

  return { success: true, action: "acknowledged", event: eventType };
}

/**
 * Handle Slack webhooks
 */
async function handleSlackWebhook(body: any, eventType: string) {
  console.log(`Processing Slack ${eventType} event`);

  // Handle Slack events (channel messages, mentions, etc.)
  return { success: true, action: "acknowledged", event: eventType };
}

/**
 * Handle Zapier webhooks
 */
async function handleZapierWebhook(body: any, eventType: string) {
  console.log(`Processing Zapier ${eventType} event`);

  // Handle Zapier webhooks
  return { success: true, action: "trigger", event: eventType };
}

/**
 * Handle Stripe webhooks
 */
async function handleStripeWebhook(body: any, eventType: string) {
  console.log(`Processing Stripe ${eventType} event`);

  // Handle billing events
  if (eventType.includes("subscription")) {
    return { success: true, action: "update_subscription", event: eventType };
  }

  return { success: true, action: "acknowledged", event: eventType };
}

/**
 * Handle Notion webhooks
 */
async function handleNotionWebhook(body: any, eventType: string) {
  console.log(`Processing Notion ${eventType} event`);

  // Handle Notion database updates
  return { success: true, action: "sync_database", event: eventType };
}

/**
 * Log webhook event for debugging and analytics
 */
async function logWebhookEvent(service: string, eventType: string, data: any) {
  try {
    await supabase.from("webhook_logs").insert({
      service,
      event_type: eventType,
      payload: data,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log webhook event:", error);
  }
}

