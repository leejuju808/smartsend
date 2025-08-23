import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/server/supabase";

export const runtime = "nodejs"; // ensures Node runtime for crypto

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/** Update profile helper */
async function setProfileByUserId(userId: string, patch: Record<string, any>) {
  await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
}

/** Can also resolve by stripe customer id if needed */
async function setProfileByCustomerId(customerId: string, patch: Record<string, any>) {
  await supabaseAdmin.from("profiles").update(patch).eq("stripe_customer_id", customerId);
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Get raw body for signature verification
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      /** After checkout session completes, tie stripe customer to our user id (stored in client_reference_id) */
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = (s.client_reference_id as string) || "";
        const customerId = (s.customer as string) || "";
        const email = (s.customer_details?.email || s.customer_email || "").toLowerCase();

        if (userId && customerId) {
          await setProfileByUserId(userId, {
            stripe_customer_id: customerId
          });
          break;
        }

        // Fallback: resolve by email if we have it
        if (email && customerId) {
          await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("email", email);
        }
        break;
      }

      /** Created or updated subscription → set pro + save ids + period end */
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        const status = sub.status; // trialing, active, past_due, canceled, etc.
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

        // Map Stripe -> our status
        const appStatus =
          status === "active" || status === "trialing" ? "pro" :
          status === "past_due" ? "pro" : // keep pro but you might restrict if unpaid too long
          "free";

        await setProfileByCustomerId(customerId, {
          subscription_status: appStatus,
          stripe_subscription_id: sub.id,
          subscription_current_period_end: periodEnd
        });
        break;
      }

      /** Canceled subscription → flip to free */
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        await setProfileByCustomerId(customerId, {
          subscription_status: "free",
          stripe_subscription_id: sub.id,
          subscription_current_period_end: null
        });
        break;
      }

      /** Successful invoice payment (good checkpoint, optional) */
      case "invoice.payment_succeeded": {
        // noop; handled by subscription.updated above
        break;
      }

      /** Payment failed → you may notify or downgrade later if needed */
      case "invoice.payment_failed": {
        // optional: log or email
        break;
      }

      default:
        // ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Webhook handler failed" }, { status: 500 });
  }
} 