import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

/**
 * POST /api/activation/step-1-2-decision-subscription
 * 
 * Step 1: Decision Capture (close the plan)
 * Step 2: Stripe Subscription (activate payment)
 * 
 * This endpoint handles both steps together as they happen in quick succession
 * during the demo close.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      plan_selected, // 'starter' | 'growth' | 'domination'
      workspace_id,
      email,
      payment_method_id, // Stripe payment method ID
      demo_notes,
      activated_by_user_id, // Sales rep who activated them
    } = body;

    if (!plan_selected || !workspace_id) {
      return NextResponse.json(
        { error: "Missing required fields: plan_selected, workspace_id" },
        { status: 400 }
      );
    }

    if (!["starter", "growth", "domination"].includes(plan_selected)) {
      return NextResponse.json(
        { error: "Invalid plan_selected. Must be starter, growth, or domination" },
        { status: 400 }
      );
    }

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspace_id)
      .single();

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get or create activation state
    let { data: activationState, error: activationError } = await supabase
      .from("roofer_activation_state")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (!activationState) {
      const { data: newState, error: createError } = await supabase
        .from("roofer_activation_state")
        .insert({
          workspace_id,
          user_id: user.id,
          step_completed: 0,
          activation_started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError || !newState) {
        return NextResponse.json(
          { error: "Failed to create activation state" },
          { status: 500 }
        );
      }
      activationState = newState;
    }

    // Step 1: Update decision capture
    const { error: step1Error } = await supabase
      .from("roofer_activation_state")
      .update({
        plan_selected,
        plan_selected_at: new Date().toISOString(),
        step_completed: 1,
        demo_notes,
        activated_by_user_id: activated_by_user_id || user.id,
      })
      .eq("id", activationState.id);

    if (step1Error) {
      return NextResponse.json(
        { error: "Failed to update step 1" },
        { status: 500 }
      );
    }

    // Step 2: Create Stripe subscription
    if (payment_method_id) {
      // Map plan to Stripe price ID
      const priceIdMap: Record<string, string> = {
        starter: process.env.STRIPE_PRICE_STARTER_ID!,
        growth: process.env.STRIPE_PRICE_GROWTH_ID!,
        domination: process.env.STRIPE_PRICE_DOMINATION_ID!,
      };

      const priceId = priceIdMap[plan_selected];
      if (!priceId) {
        return NextResponse.json(
          { error: `No Stripe price ID configured for plan: ${plan_selected}` },
          { status: 500 }
        );
      }

      // Get or create Stripe customer
      let customerId: string;
      const { data: existingSub } = await supabase
        .from("workspace_billing_subscriptions")
        .select("stripe_customer_id")
        .eq("workspace_id", workspace_id)
        .maybeSingle();

      if (existingSub?.stripe_customer_id) {
        customerId = existingSub.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          email: email || user.email || undefined,
          metadata: {
            workspace_id,
            user_id: user.id,
            plan: plan_selected,
          },
        });
        customerId = customer.id;

        // Attach payment method
        await stripe.paymentMethods.attach(payment_method_id, {
          customer: customerId,
        });

        // Set as default
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: payment_method_id,
          },
        });
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          workspace_id,
          user_id: user.id,
          plan: plan_selected,
          activation_flow: "true",
        },
      });

      // Update activation state with subscription info
      const { error: step2Error } = await supabase
        .from("roofer_activation_state")
        .update({
          stripe_subscription_id: subscription.id,
          stripe_customer_id: customerId,
          subscription_activated_at: new Date().toISOString(),
          step_completed: 2,
        })
        .eq("id", activationState.id);

      if (step2Error) {
        console.error("Failed to update step 2:", step2Error);
        // Don't fail the request, subscription was created
      }

      // Update workspace billing subscription
      await supabase.from("workspace_billing_subscriptions").upsert({
        workspace_id,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        plan_code: plan_selected,
        status: subscription.status === "active" ? "active" : "incomplete",
      });

      return NextResponse.json({
        success: true,
        step_completed: 2,
        plan_selected,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        subscription_status: subscription.status,
        message: "Alright, your SmartSend account is now live.",
      });
    } else {
      // Step 1 only (no payment method yet)
      return NextResponse.json({
        success: true,
        step_completed: 1,
        plan_selected,
        message: "Plan selected. Ready for payment setup.",
      });
    }
  } catch (error: any) {
    console.error("Error in step-1-2-decision-subscription:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































