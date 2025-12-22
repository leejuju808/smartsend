import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { stripe } from "@/lib/stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  try {
    // Check authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    // Restrict to founder email
    if (profile?.email !== "julian@smartsendhq.com") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all metrics in parallel
    const [{ data: active }, { data: onboard }, { data: ref }, { data: mail }, { count: phUpvotes }, { count: demoClicks }, { count: signups }, { data: engagement }] =
      await Promise.all([
        supabaseAdmin.from("active_users").select("*").single(),
        supabaseAdmin.from("onboarding_stats").select("*").single(),
        supabaseAdmin.from("referral_stats").select("*").single(),
        supabaseAdmin.from("email_activity").select("*").single(),
        supabaseAdmin.from("launch_events").select("*", { count: 'exact', head: true }).eq("event", "ph_upvote"),
        supabaseAdmin.from("launch_events").select("*", { count: 'exact', head: true }).eq("event", "demo_click"),
        supabaseAdmin.from("launch_events").select("*", { count: 'exact', head: true }).eq("event", "signup").gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabaseAdmin.from("engagement_overview").select("*").single(),
      ]);

    // Fetch MRR from Stripe API directly
    let mrr = 0;
    let activePaidUsers = 0;
    try {
      const subs = await stripe.subscriptions.list({ 
        status: "active", 
        limit: 100 
      });
      
      activePaidUsers = subs.data.length;
      mrr = subs.data.reduce((acc, s) => {
        const amount = s.items.data[0]?.price?.unit_amount || 0;
        return acc + amount / 100;
      }, 0);
      
      mrr = Math.round(mrr * 100) / 100;
    } catch (error) {
      console.error("Error fetching MRR:", error);
      // Continue with mrr = 0 if Stripe fails
    }

    // Retention metrics: Upgrade rate and churn rate
    let upgradeRate = 0;
    let churnRate = 0;
    try {
      // Get upgrade rate: % of free users who upgraded
      const { data: allProfiles } = await supabaseAdmin
        .from("profiles")
        .select("plan, subscription_status");

      if (allProfiles && allProfiles.length > 0) {
        const totalFree = allProfiles.filter(p => 
          (p.plan === 'free' || !p.plan) && 
          (!p.subscription_status || p.subscription_status === 'free')
        ).length;
        const totalPro = allProfiles.filter(p => 
          p.plan === 'pro' || p.plan === 'team' || 
          p.subscription_status === 'active' || p.subscription_status === 'pro'
        ).length;

        if (totalFree > 0) {
          upgradeRate = Math.round((totalPro / totalFree) * 100 * 100) / 100;
        }

        // Churn rate: canceled subs / total subs
        const { count: canceledCount } = await supabaseAdmin
          .from("billing_subscriptions")
          .select("id", { count: 'exact', head: true })
          .eq("status", "canceled");

        const { count: totalCount } = await supabaseAdmin
          .from("billing_subscriptions")
          .select("id", { count: 'exact', head: true });

        if (totalCount && totalCount > 0 && canceledCount) {
          churnRate = Math.round((canceledCount / totalCount) * 100 * 100) / 100;
        }
      }
    } catch (error) {
      console.error("Error calculating retention metrics:", error);
    }

    return NextResponse.json({
      active_users: active?.active_users || 0,
      activation_rate: onboard?.activation_rate || 0,
      referrals: ref?.activated_referrals || 0,
      emails: mail?.sent_this_month || 0,
      mrr,
      ph_upvotes: phUpvotes || 0,
      demo_clicks: demoClicks || 0,
      signups_this_week: signups || 0,
      active_paid_users: activePaidUsers,
      upgrade_rate: upgradeRate,
      churn_rate: churnRate,
      avg_engagement_score: engagement?.avg_score || 0,
      at_risk_users: engagement?.at_risk_users || 0,
      healthy_users: engagement?.healthy_users || 0,
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}

