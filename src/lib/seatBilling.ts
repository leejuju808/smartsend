import { stripe } from "./stripe";
import { supabaseAdmin } from "@/server/supabase";

export async function syncSeatsToStripe(teamId: string) {
  // 1) count active members
  const { data: members } = await supabaseAdmin
    .from("team_members").select("user_id").eq("team_id", teamId);
  const seats = (members?.length || 1);

  // 2) find owner -> profiles row -> stripe_subscription_id
  const { data: team } = await supabaseAdmin.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) return;

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", team.owner_id)
    .maybeSingle();

  const subId = prof?.stripe_subscription_id;
  if (!subId) return;

  // 3) set quantity on the one and only Pro line (assumes single-product plan)
  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    if (item) {
      await stripe.subscriptionItems.update(item.id, { quantity: seats });
    }
  } catch (error) {
    console.error("Failed to sync seats to Stripe:", error);
  }
} 