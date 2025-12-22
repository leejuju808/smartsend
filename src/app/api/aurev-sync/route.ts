import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * AUREV OS Sync API
 * 
 * Returns summarized SmartSend metrics for AUREV HQ unified dashboard.
 * Secured with AUREV_SYNC_KEY header authentication.
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate with shared sync key
    const authKey = req.headers.get("x-aurev-sync-key");
    if (authKey !== process.env.AUREV_SYNC_KEY) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 }
      );
    }

    // Use service role client for server-to-server sync
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Fetch metrics in parallel for better performance
    const [{ data: users, error: usersError }, { data: campaigns, error: campaignsError }, subscriptionsResult, billingSubsResult, profilesResult, marketplaceAgentsResult] = await Promise.all([
      // Get all profiles (active users)
      supabase
        .from("profiles")
        .select("id")
        .limit(10000), // Reasonable limit
      
      // Get active campaigns (check for common active statuses)
      supabase
        .from("campaigns")
        .select("id, status")
        .in("status", ["active", "running", "sending"]),
      
      // Try subscriptions table first
      supabase
        .from("subscriptions")
        .select("plan, status, plan_id")
        .limit(10000)
        .then(result => ({ ...result, source: "subscriptions" }))
        .catch(() => ({ data: null, error: null, source: "subscriptions" })),
      
      // Try billing_subscriptions table as fallback
      supabase
        .from("billing_subscriptions")
        .select("plan, status")
        .limit(10000)
        .then(result => ({ ...result, source: "billing_subscriptions" }))
        .catch(() => ({ data: null, error: null, source: "billing_subscriptions" })),
      
      // Also get plans from profiles for comprehensive coverage
      supabase
        .from("profiles")
        .select("plan, subscription_status")
        .limit(10000)
        .then(result => ({ ...result, source: "profiles" }))
        .catch(() => ({ data: null, error: null, source: "profiles" })),
      
      // Get marketplace agents stats
      supabase
        .from("marketplace_agents")
        .select("id, downloads, price, category")
        .limit(10000)
        .then(result => ({ ...result, source: "marketplace_agents" }))
        .catch(() => ({ data: null, error: null, source: "marketplace_agents" }))
    ]);

    // Handle errors gracefully
    if (usersError) {
      console.error("Error fetching users:", usersError);
    }
    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
    }

    // Aggregate subscription plans from multiple sources
    const plans: Record<string, number> = {};
    
    // From subscriptions table
    if (subscriptionsResult?.data) {
      subscriptionsResult.data.forEach((sub: any) => {
        const planKey = sub.plan || sub.plan_id || "unknown";
        plans[planKey] = (plans[planKey] || 0) + 1;
      });
    }
    
    // From billing_subscriptions table
    if (billingSubsResult?.data) {
      billingSubsResult.data.forEach((sub: any) => {
        const planKey = sub.plan || "unknown";
        plans[planKey] = (plans[planKey] || 0) + 1;
      });
    }
    
    // From profiles (aggregate by plan field)
    if (profilesResult?.data) {
      profilesResult.data.forEach((profile: any) => {
        const planKey = profile.plan || profile.subscription_status || "free";
        if (planKey && planKey !== "unknown") {
          plans[planKey] = (plans[planKey] || 0) + 1;
        }
      });
    }

    // Calculate MRR from active subscriptions if available
    // Note: MRR calculation would require pricing data from plans table or Stripe
    // For now, we return plan counts and let HQ calculate MRR if needed
    let mrr = 0;
    try {
      // Count active subscriptions across all sources
      const activeSubs = [
        ...(subscriptionsResult?.data?.filter((s: any) => s.status === "active" || s.status === "trialing") || []),
        ...(billingSubsResult?.data?.filter((s: any) => s.status === "active" || s.status === "trialing") || []),
      ];
      // MRR calculation would require plan pricing - placeholder for now
      // HQ can calculate MRR using plan counts and known pricing tiers
    } catch (error) {
      console.error("Error calculating MRR:", error);
    }

    // Calculate marketplace metrics
    let marketplace_agents = 0;
    let marketplace_downloads = 0;
    let marketplace_revenue = 0;
    
    try {
      if (marketplaceAgentsResult?.data) {
        marketplace_agents = marketplaceAgentsResult.data.length;
        marketplace_downloads = marketplaceAgentsResult.data.reduce((sum: number, agent: any) => sum + (agent.downloads || 0), 0);
        // Estimate revenue from downloads * price (conservative estimate)
        marketplace_revenue = marketplaceAgentsResult.data.reduce((sum: number, agent: any) => 
          sum + ((agent.downloads || 0) * (agent.price || 0)), 0
        );
      }
    } catch (error) {
      console.error("Error calculating marketplace metrics:", error);
    }

    return NextResponse.json({
      app: "smartsend",
      active_users: users?.length || 0,
      active_campaigns: campaigns?.length || 0,
      plans,
      mrr, // Placeholder - can be calculated by HQ using plan counts
      marketplace: {
        agents: marketplace_agents,
        downloads: marketplace_downloads,
        estimated_revenue: marketplace_revenue,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("AUREV sync API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

