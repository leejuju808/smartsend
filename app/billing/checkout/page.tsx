import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export default async function BillingCheckoutPage({
  searchParams,
}: {
  searchParams: { priceId?: string; plan?: string };
}) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return redirect("/login");
  }

  const priceId = searchParams.priceId;
  const plan = searchParams.plan;

  if (!priceId) {
    return redirect("/dashboard/billing");
  }

  // Workspace check - try team_members first (used by billing routes)
  const { data: membership } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  let workspaceId = membership?.workspace_id;
  let userRole = membership?.role;

  // If no team_members, try workspace_members (used by auth callback)
  if (!workspaceId) {
    const { data: wsMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .maybeSingle();
    
    workspaceId = wsMembership?.workspace_id;
  }

  if (!workspaceId) {
    // create workspace
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .insert({
        name: `${user.email}'s Workspace`,
        owner_id: user.id,
      })
      .select()
      .single();

    if (wsErr) {
      console.error(wsErr);
      return redirect("/dashboard/billing");
    }

    workspaceId = ws.id;
    userRole = "owner";

    // add owner membership to team_members (used by billing)
    await supabase.from("team_members").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "owner",
      email: user.email || "",
      status: "active",
    });

    // also add to workspace_members for consistency
    await supabase.from("workspace_members").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "owner",
    });

    // create default limits
    await supabase.rpc("create_default_workspace_limits", {
      workspace: workspaceId,
    });
  }

  // Only owner/admin can start checkout
  if (userRole !== "owner" && userRole !== "admin") {
    return redirect("/dashboard/billing");
  }

  // Subscription row (if exists)
  const { data: existingSub } = await supabase
    .from("workspace_billing_subscriptions")
    .select("id, stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const successUrl = `${baseUrl}/dashboard/billing`;
  const cancelUrl = `${baseUrl}/dashboard/billing`;

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

  if (!session.url) {
    return redirect("/dashboard/billing");
  }

  return redirect(session.url);
}

