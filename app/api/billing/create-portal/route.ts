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

  const returnUrl =
    `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing` ||
    "http://localhost:3000/dashboard/billing";

  // workspace + role
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return Response.json({ error: "not_allowed" }, { status: 403 });
  }

  const workspaceId = membership.workspace_id;

  const { data: sub, error: subErr } = await supabase
    .from("workspace_billing_subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .single();

  if (subErr || !sub?.stripe_customer_id) {
    return Response.json({ error: "no_customer" }, { status: 400 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });

  return Response.json({ url: portal.url }, { status: 200 });
}

