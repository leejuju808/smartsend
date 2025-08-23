import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });

function unix(ts: Date) { return Math.floor(ts.getTime() / 1000); }

async function main() {
  const now = new Date();
  const start = new Date(now); 
  start.setUTCHours(0,0,0,0); 
  start.setDate(start.getDate()-1);
  const end = new Date(start); 
  end.setUTCHours(23,59,59,999);

  console.log(`Reporting usage for ${start.toISOString()} to ${end.toISOString()}`);

  // Fetch teams that have a usage item
  const { data: teams } = await sb
    .from("teams")
    .select("id, stripe_usage_item_id")
    .not("stripe_usage_item_id", "is", null);

  console.log(`Found ${teams?.length || 0} teams with usage tracking`);

  for (const t of teams || []) {
    const itemId = t.stripe_usage_item_id as string;
    if (!itemId) continue;

    // Count yesterday's replies for team (excluding credit-covered events)
    const { data, count } = await sb
      .from("ai_reply_events")
      .select("id", { count: "exact", head: true })
      .eq("team_id", t.id)
      .eq("covered_by_credit", false)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    const qty = count || 0;
    if (qty <= 0) {
      console.log(`No replies for team ${t.id} yesterday`);
      continue;
    }

    try {
      // Report to Stripe (timestamp anywhere within that day; use end)
      await (stripe as any).subscriptionItems.createUsageRecord(itemId, {
        quantity: qty,
        timestamp: unix(end),
        action: "set" // idempotent per-period if you want to overwrite for that timestamp
      });
      console.log(`✅ Reported ${qty} replies for team ${t.id}`);
    } catch (error: any) {
      console.error(`❌ Failed to report usage for team ${t.id}:`, error.message);
    }
  }

  console.log("Usage reporting complete");
}

main().catch((e) => { 
  console.error("Usage reporting failed:", e); 
  process.exit(1); 
}); 