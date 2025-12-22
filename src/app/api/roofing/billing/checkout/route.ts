import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, getPriceIdFromPlanId } from "@/lib/billing/stripe";

/**
 * BLOCK 268000 — Payment Moment v1
 * POST /api/roofing/billing/checkout
 * Body: { company_id: string, plan: 'starter' | 'growth' | 'domination' }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { company_id, plan } = body as {
      company_id?: string;
      plan?: "starter" | "growth" | "domination";
    };

    if (!company_id || !plan || !["starter", "growth", "domination"].includes(plan)) {
      return NextResponse.json(
        { error: "company_id and valid plan are required" },
        { status: 400 }
      );
    }

    // Verify user owns the company (v1 simple)
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("id, owner_id, name")
      .eq("id", company_id)
      .single();

    if (companyError || !company || company.owner_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const priceId = getPriceIdFromPlanId(plan);
    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price not configured for this plan" },
        { status: 500 }
      );
    }

    // Get existing subscription row (for stripe_customer_id reuse)
    const { data: existingSub } = await supabase
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company_id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: company.name || "SmartSend Roofing Company",
        metadata: {
          company_id,
          owner_user_id: user.id,
        },
      });

      customerId = customer.id;

      // Initialize subscription row (trial until paid)
      await supabase
        .from("company_subscriptions")
        .upsert(
          {
            company_id,
            stripe_customer_id: customerId,
            plan,
            status: "trial",
            started_at: new Date().toISOString(),
          },
          { onConflict: "company_id" }
        );
    } else {
      // Keep local plan selection aligned for UI clarity
      await supabase
        .from("company_subscriptions")
        .upsert(
          { company_id, plan },
          { onConflict: "company_id" }
        );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/estimates?payment=success`,
      cancel_url: `${baseUrl}/dashboard/estimates?payment=canceled`,
      metadata: {
        company_id,
        plan,
        block: "268000",
      },
      subscription_data: {
        metadata: {
          company_id,
          plan,
          block: "268000",
        },
      },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error: any) {
    console.error("Error creating company checkout session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}










