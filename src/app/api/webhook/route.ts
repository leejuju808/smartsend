import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new Response("missing sig", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    console.error("webhook signature error", err.message);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const user_id = sub.metadata?.user_id;
        const status = sub.status;
        if (user_id) {
          await supabaseAdmin.from("profiles").update({
            subscription_status:
              status === "active" || status === "trialing" ? "pro" : status,
            stripe_customer_id: sub.customer as string,
            stripe_subscription_id: sub.id,
          }).eq("id", user_id);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const user_id = sub.metadata?.user_id;
        if (user_id) {
          await supabaseAdmin.from("profiles").update({
            subscription_status: "free",
          }).eq("id", user_id);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("webhook handler error", e);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok");
}

