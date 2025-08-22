import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });

export async function POST(req: Request) {
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    const sig = headers().get("stripe-signature") as string;
    
    if (!sig) {
      return new NextResponse("Missing stripe-signature header", { status: 400 });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session completed:', session.id);
        // Add your checkout session completion logic here
        break;
      case 'customer.subscription.created':
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription created:', subscription.id);
        // Add your subscription creation logic here
        break;
      case 'customer.subscription.updated':
        const updatedSubscription = event.data.object as Stripe.Subscription;
        console.log('Subscription updated:', updatedSubscription.id);
        // Add your subscription update logic here
        break;
      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object as Stripe.Subscription;
        console.log('Subscription deleted:', deletedSubscription.id);
        // Add your subscription deletion logic here
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err?.message || err);
    return new NextResponse(`Webhook Error: ${err?.message || 'Unknown error'}`, { status: 500 });
  }
} 