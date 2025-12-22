// Referral Payouts Edge Function
// Sends monthly Stripe transfers to referrers for 10% recurring commission

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2022-11-15"
});

serve(async () => {
  try {
    console.log("Referral Payouts: Starting monthly payout processing");

    // Get all pending referrals with active subscriptions
    const { data: referrals, error: fetchError } = await supabase
      .from("referral_tracking")
      .select(`
        *,
        referred_org:subscriptions!referral_tracking_subscription_id_fkey (
          stripe_customer_id,
          stripe_subscription_id,
          status
        )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("Error fetching referrals:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch referrals" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!referrals || referrals.length === 0) {
      console.log("No pending referral payouts found");
      return new Response(
        JSON.stringify({ ok: true, message: "No payouts to process" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${referrals.length} pending referral payouts`);

    let processed = 0;
    let failed = 0;
    const results = [];

    for (const referral of referrals) {
      try {
        // Check if subscription is active
        const subscription = referral.referred_org;
        if (!subscription || subscription.status !== 'active') {
          console.log(`Skipping referral ${referral.id} - subscription not active`);
          continue;
        }

        // Get referrer's profile to find Stripe connected account
        const { data: referrerProfile, error: profileError } = await supabase
          .from("profiles")
          .select("stripe_customer_id, email")
          .eq("id", referral.referrer_id)
          .single();

        if (profileError || !referrerProfile) {
          console.error(`Error fetching referrer profile ${referral.referrer_id}:`, profileError);
          failed++;
          continue;
        }

        // Calculate commission (10% of subscription amount)
        if (!referral.commission_amount) {
          console.error(`Missing commission_amount for referral ${referral.id}`);
          failed++;
          continue;
        }

        const commissionAmountCents = Math.round(referral.commission_amount * 100);

        // If referrer has a Stripe Connect account, create transfer
        if (referrerProfile.stripe_customer_id) {
          try {
            console.log(`Processing payout: $${referral.commission_amount} to referrer ${referral.referrer_id}`);

            // Create transfer to referrer's account
            // Note: In production, you'd need Stripe Connect set up with connected accounts
            // For now, we'll log the transfer
            const transfer = await stripe.transfers.create({
              amount: commissionAmountCents,
              currency: 'usd',
              destination: referrerProfile.stripe_customer_id, // Should be connected account ID
              description: `Referral commission for ${referral.referral_code} - ${referral.commission_rate * 100}% recurring`,
              metadata: {
                referral_id: referral.id,
                referral_code: referral.referral_code,
                subscription_id: subscription.stripe_subscription_id
              }
            });

            console.log(`Transfer created: ${transfer.id}`);

            // Update referral tracking
            const { error: updateError } = await supabase
              .from("referral_tracking")
              .update({
                status: "paid",
                updated_at: new Date().toISOString(),
                first_paid_at: new Date().toISOString()
              })
              .eq("id", referral.id);

            if (updateError) {
              console.error(`Error updating referral ${referral.id}:`, updateError);
              failed++;
            } else {
              processed++;
              results.push({
                referral_id: referral.id,
                referrer_id: referral.referrer_id,
                amount: referral.commission_amount,
                transfer_id: transfer.id,
                success: true
              });
            }

          } catch (stripeError) {
            console.error(`Stripe error for referral ${referral.id}:`, stripeError);
            failed++;
            results.push({
              referral_id: referral.id,
              referrer_id: referral.referrer_id,
              error: stripeError instanceof Error ? stripeError.message : "Stripe error",
              success: false
            });
          }

        } else {
          // No Stripe account set up - log for manual processing
          console.log(`Referrer ${referral.referrer_id} has no Stripe account - manual payout needed`);
          failed++;
          results.push({
            referral_id: referral.id,
            referrer_id: referral.referrer_id,
            email: referrerProfile.email,
            amount: referral.commission_amount,
            error: "No Stripe account configured",
            success: false,
            needs_manual: true
          });
        }

      } catch (error) {
        console.error(`Error processing referral ${referral.id}:`, error);
        failed++;
        results.push({
          referral_id: referral.id,
          error: error instanceof Error ? error.message : "Unknown error",
          success: false
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: referrals.length,
        processed,
        failed,
        results
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in referral-payouts:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
