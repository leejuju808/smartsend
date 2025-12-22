import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const body = await req.json();
  const priceId: string | undefined = body.priceId;
  const successUrl: string =
    body.successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;
  const cancelUrl: string =
    body.cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;

  if (!priceId) {
    return Response.json({ error: "price_required" }, { status: 400 });
  }

  // workspace
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Only owner/admin can start checkout
  if (membership.role !== "owner" && membership.role !== "admin") {
    return Response.json({ error: "not_allowed" }, { status: 403 });
  }

  // Subscription row (if exists)
  const { data: existingSub } = await supabase
    .from("workspace_billing_subscriptions")
    .select("id, stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .single();

  let stripeCustomerId = existingSub?.stripe_customer_id;

  // Create Stripe customer if needed
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: {
        workspace_id: workspaceId,
        user_id: user.id,
      },
    });

    stripeCustomerId = customer.id;

    await supabase.from("workspace_billing_subscriptions").upsert(
      {
        workspace_id: workspaceId,
        stripe_customer_id: stripeCustomerId,
        plan_code: "free",
        status: "inactive",
      },
      {
        onConflict: "workspace_id",
      }
    );
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: cancelUrl,
    metadata: {
      workspace_id: workspaceId,
    },
  });

  return Response.json(
    {
      url: session.url,
    },
    { status: 200 }
  );
}

