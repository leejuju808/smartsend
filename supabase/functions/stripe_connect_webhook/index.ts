import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.18.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_CONNECT_WEBHOOK_SECRET = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { 
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient()
});

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (e: any) {
    console.error("Webhook signature verification failed:", e.message);
    return new Response(`Bad sig: ${e.message}`, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const type = event.type;

  // Always store raw event for audit trail
  try {
    await supabase.from("stripe_events").upsert({
      id: event.id,
      type,
      payload: event.data.object as any,
    }, { onConflict: "id" });
  } catch (e) {
    console.error("Failed to store stripe event:", e);
  }

  // Handle invoice events for revenue tracking
  if (type === "invoice.finalized" || type === "invoice.payment_succeeded") {
    const inv = event.data.object as Stripe.Invoice;
    
    // Extract app and org_id from metadata
    const app = (inv.metadata?.app || inv.subscription_details?.metadata?.app || "smartsend") as "smartsend" | "opsgrid" | "agentcloud";
    const orgId = inv.metadata?.org_id || null;
    const workspaceId = inv.metadata?.workspace_id || null;

    // Process each line item
    for (const li of inv.lines.data) {
      // Determine product name from price metadata or nickname
      const product = li.price?.metadata?.product || 
                     li.price?.nickname || 
                     li.price?.id || 
                     li.description ||
                     "unknown";

      const quantity = li.quantity || 1;
      const amountTotal = li.amount || inv.amount_paid || 0;

      // Insert line item
      const { error } = await supabase.from("billing_line_items").insert({
        app,
        org_id: orgId,
        workspace_id: workspaceId,
        invoice_id: inv.id,
        customer_id: typeof inv.customer === "string" ? inv.customer : inv.customer?.id || "",
        product,
        price_id: li.price?.id,
        quantity,
        amount_total: amountTotal,
        currency: inv.currency || "usd",
        period_start: li.period?.start ? new Date(li.period.start * 1000).toISOString() : new Date(inv.created * 1000).toISOString(),
        period_end: li.period?.end ? new Date(li.period.end * 1000).toISOString() : new Date(inv.created * 1000).toISOString(),
      });

      if (error) {
        console.error("Failed to insert billing line item:", error);
      }
    }
  }

  // Handle subscription events (mirror existing stripe-webhook logic if needed)
  if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const items = sub.items.data;
    
    if (items.length > 0) {
      const price = items[0].price;
      const planName = price.nickname || price.id;
      
      // Map plan name to our plan format
      let plan = "starter";
      const planLower = planName.toLowerCase();
      if (planLower.includes("free")) plan = "free";
      else if (planLower.includes("starter")) plan = "starter";
      else if (planLower.includes("growth")) plan = "growth";
      else if (planLower.includes("pro")) plan = "pro";

      const workspaceId = (sub.metadata as any)?.workspace_id;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

      if (workspaceId && customerId) {
        await supabase
          .from("billing_subscriptions")
          .upsert({
            id: sub.id,
            workspace_id: workspaceId,
            customer_id: customerId,
            plan: plan,
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end || false,
            updated_at: new Date().toISOString()
          }, { onConflict: "id" });
      }
    }
  }

  if (type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await supabase
      .from("billing_subscriptions")
      .update({ 
        status: "canceled",
        updated_at: new Date().toISOString()
      })
      .eq("id", sub.id);
  }

  // Optionally handle balances/payouts via 'balance.available' + 'payout.paid'
  // TODO: Add payout tracking if using Stripe Connect

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
});

