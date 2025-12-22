/**
 * Block 23690 — Billing Update Link API
 * Generates secure Stripe Customer Portal links for updating payment methods
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * GET /api/billing/update-link?token=xxx
 * Validates token and redirects to Stripe Customer Portal
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Find billing update link
    const { data: link } = await supabase
      .from("billing_update_links")
      .select("*, billing_recovery_states(stripe_customer_id)")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .is("used_at", null)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    // Get stripe_customer_id from recovery state
    const { data: recoveryState } = await supabase
      .from("billing_recovery_states")
      .select("stripe_customer_id")
      .eq("id", link.recovery_state_id)
      .single();

    if (!recoveryState) {
      return NextResponse.json({ error: "Recovery state not found" }, { status: 404 });
    }

    // Create Stripe Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: recoveryState.stripe_customer_id,
      return_url: `${APP_URL}/settings?section=billing&updated=true`,
    });

    // Mark link as used
    await supabase
      .from("billing_update_links")
      .update({ used_at: new Date().toISOString() })
      .eq("id", link.id);

    // Redirect to Stripe Customer Portal
    return NextResponse.redirect(session.url);
  } catch (error: any) {
    console.error("Error generating billing update link:", error);
    return NextResponse.json(
      { error: "Failed to generate update link" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/billing/update-link
 * Creates a new billing update link for a user
 */
export async function POST(req: NextRequest) {
  try {
    const { recovery_state_id, stripe_customer_id } = await req.json();

    if (!recovery_state_id || !stripe_customer_id) {
      return NextResponse.json(
        { error: "recovery_state_id and stripe_customer_id required" },
        { status: 400 }
      );
    }

    // Create billing update link via database function
    const { data: token, error } = await supabase.rpc("create_billing_update_link", {
      p_recovery_state_id: recovery_state_id,
      p_stripe_customer_id: stripe_customer_id,
      p_expires_hours: 168, // 7 days
    });

    if (error || !token) {
      return NextResponse.json(
        { error: "Failed to create update link" },
        { status: 500 }
      );
    }

    const updateLink = `${APP_URL}/billing/update-link?token=${token}`;

    return NextResponse.json({
      success: true,
      link: updateLink,
      token,
    });
  } catch (error: any) {
    console.error("Error creating billing update link:", error);
    return NextResponse.json(
      { error: "Failed to create update link" },
      { status: 500 }
    );
  }
}






































