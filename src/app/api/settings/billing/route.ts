import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// GET /api/settings/billing - Get billing and subscription info
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get organization
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .single();

    // Get billing info from org_billing table
    const { data: billingInfo, error: billingError } = await supabase.rpc(
      'get_org_billing_info',
      { p_org_id: orgId }
    );

    if (billingError) {
      console.error('Error fetching billing info:', billingError);
    }

    const billing = billingInfo?.[0] || {
      current_plan: 'trial',
      subscription_status: 'trialing',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_start: null,
      current_period_end: null,
      max_active_campaigns: 1,
      monthly_email_limit: 200,
    };

    // Get Stripe subscription details if available
    let subscription = null;
    if (billing.stripe_subscription_id) {
      try {
        subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
      } catch (e) {
        console.error("Error fetching Stripe subscription:", e);
      }
    }

    // Get active campaign count
    const { count: activeCampaignCount } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["active", "running", "scheduled"]);

    // Get email usage for current billing period
    const periodStart = billing.current_period_start
      ? new Date(billing.current_period_start).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0].slice(0, 7) + '-01';

    const { data: usageData } = await supabase
      .from("org_usage")
      .select("emails_sent")
      .eq("org_id", orgId)
      .eq("period_start", periodStart)
      .single();

    const emailsSent = usageData?.emails_sent || 0;

    // Map plan names
    const planNameMap: Record<string, string> = {
      trial: 'Trial',
      starter: 'Starter',
      growth: 'Growth',
      domination: 'Domination',
    };

    const plan = planNameMap[billing.current_plan] || 'Trial';
    const renewalDate = billing.current_period_end || null;
    const monthlyEmails = billing.monthly_email_limit;
    const campaignLimit = billing.max_active_campaigns === null ? -1 : billing.max_active_campaigns;

    // Create Stripe portal session URL
    let portalUrl = null;
    if (billing.stripe_customer_id) {
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: billing.stripe_customer_id,
          return_url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/settings?section=billing`,
        });
        portalUrl = session.url;
      } catch (e) {
        console.error("Error creating Stripe portal session:", e);
      }
    }

    return NextResponse.json({
      org: {
        id: org?.id,
        name: org?.name,
      },
      subscription: {
        plan,
        status: billing.subscription_status,
        renewal_date: renewalDate,
        stripe_customer_id: billing.stripe_customer_id,
        stripe_subscription_id: billing.stripe_subscription_id,
      },
      usage: {
        campaigns: activeCampaignCount || 0,
        campaign_limit: campaignLimit,
        emails_sent_this_month: emailsSent,
        monthly_email_limit: monthlyEmails === null ? -1 : monthlyEmails,
      },
      portal_url: portalUrl,
    });
  } catch (error: any) {
    console.error("Error fetching billing info:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
