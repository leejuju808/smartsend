import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { log } from "@/lib/logger";
import { lockSendQueue, unlockSendQueue } from "@/lib/billing/recovery-service";
import { getPlanIdFromPriceId } from "@/lib/billing/stripe";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const runtime = 'nodejs';

async function tryMarkSalesLeadPaidByCustomer(customerId: string, reason: string) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    const email = (customer as any)?.email ? String((customer as any).email).toLowerCase() : '';
    if (!email) return;

    await supabase
      .from('sales_leads')
      .update({ status: 'paid', notes: `[${new Date().toISOString()}] Auto-marked paid (${reason}).` })
      .eq('status', 'trial') // prefer upgrading trials
      .ilike('email', email);

    // Also handle cases where lead skipped trial and went straight to paid
    await supabase
      .from('sales_leads')
      .update({ status: 'paid', notes: `[${new Date().toISOString()}] Auto-marked paid (${reason}).` })
      .in('status', ['prospect', 'demo_booked'])
      .ilike('email', email);
  } catch {
    // never block webhook
  }
}

/**
 * Block 417: Stripe Webhook Handler
 * Syncs Stripe subscription events to workspace_billing_subscriptions
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const buf = Buffer.from(await req.arrayBuffer());
  let evt: Stripe.Event;
  try {
    evt = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    await log.info('stripe_webhook', `Received webhook: ${evt.type}`, {
      event_id: evt.id,
      event_type: evt.type,
    });
  } catch (e: any) {
    await log.error('stripe_webhook', `Webhook signature verification failed: ${e.message}`, {
      error: e.message,
    }, undefined, e);
    return new Response(`Webhook Error: ${e.message}`, { status: 400 });
  }

  // Block 417: Handle subscription events for workspace subscriptions
  // Block 10300: Also handle founders deal subscriptions
  if (evt.type === "customer.subscription.created" || evt.type === "customer.subscription.updated") {
    const sub = evt.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const priceId = sub.items.data[0]?.price?.id;
    const priceNickname = sub.items.data[0]?.price?.nickname?.toLowerCase() || "";
    const priceMetadata = sub.items.data[0]?.price?.metadata || {};
    
    // Check if this is a founders deal subscription
    const isFounder = (sub.metadata as any)?.founder === "true" || 
                      priceMetadata?.founder === "true" ||
                      priceNickname.includes("founder");
    
    // Map price nickname/metadata to plan_id
    let planId = "starter";
    const planFromMetadata = (sub.metadata as any)?.plan || priceMetadata?.plan_type;
    if (planFromMetadata && ["starter", "growth", "domination"].includes(planFromMetadata)) {
      planId = planFromMetadata;
    } else if (priceNickname.includes("starter")) planId = "starter";
    else if (priceNickname.includes("growth")) planId = "growth";
    else if (priceNickname.includes("domination")) planId = "domination";
    else if (priceNickname.includes("pro")) planId = "pro";
    else if (priceNickname.includes("agency")) planId = "agency";
    
    // Map plan_id to plan_key for legacy compatibility
    let planKey = planId;
    if (planId === "growth") planKey = "pro"; // Map growth to pro for legacy
    else if (planId === "domination") planKey = "agency"; // Map domination to agency for legacy

    // Try to get workspace_id from metadata or lookup
    let workspaceId = (sub.metadata as any)?.workspace_id;
    
    if (!workspaceId) {
      // Lookup workspace by customer_id
      const { data: existing } = await supabase
        .from("workspace_billing_subscriptions")
        .select("workspace_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      
      if (existing) {
        workspaceId = existing.workspace_id;
      } else {
        // Try workspace_subscriptions table
        const { data: wsSub } = await supabase
          .from("workspace_subscriptions")
          .select("workspace_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        
        if (wsSub) {
          workspaceId = wsSub.workspace_id;
        }
      }
    }

    if (workspaceId) {
      const cps = (sub as any).current_period_start;
      const cpe = (sub as any).current_period_end;

      // Update workspace_billing_subscriptions (legacy)
      await supabase
        .from("workspace_billing_subscriptions")
        .upsert(
          {
            workspace_id: workspaceId,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            plan_code: planKey,
            plan_key: planKey,
            status: sub.status,
            current_period_start: cps ? new Date(cps * 1000).toISOString() : null,
            current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
            cancel_at_period_end: sub.cancel_at_period_end || false,
          },
          { onConflict: "workspace_id" }
        );

      // Update workspace_subscriptions (Block 10300 - founders deal)
      await supabase
        .from("workspace_subscriptions")
        .upsert(
          {
            workspace_id: workspaceId,
            plan_id: planId,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            status: sub.status,
            current_period_start: cps ? new Date(cps * 1000).toISOString() : null,
            current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
            is_founder: isFounder,
          },
          { onConflict: "workspace_id" }
        );

      // Update founders_deal_eligibility if converted
      if (isFounder && evt.type === "customer.subscription.created") {
        await supabase
          .from("founders_deal_eligibility")
          .update({
            converted_at: new Date().toISOString(),
            converted_plan_id: planId,
          })
          .eq("workspace_id", workspaceId);
      }

      await log.info('stripe_webhook', `Updated workspace subscription`, {
        workspace_id: workspaceId,
        plan_id: planId,
        plan_key: planKey,
        is_founder: isFounder,
        status: sub.status,
      });

      // BLOCK 282000 — Conversion event tracking
      // subscription start / founder offer accepted → sales_leads.status = paid
      if (sub.status === 'active') {
        await tryMarkSalesLeadPaidByCustomer(customerId, isFounder ? 'founder_offer' : 'subscription_start');
      }
    } else {
      await log.warn('stripe_webhook', 'Workspace not found for subscription', {
        customer_id: customerId,
        subscription_id: sub.id,
      });
    }
  }

  // =========================================================
  // BLOCK 268000 — Roofing Company Subscription Sync (Payment Moment v1)
  // Sync Stripe subscription to company_subscriptions when company_id is present in metadata.
  // =========================================================
  if (evt.type === "customer.subscription.created" || evt.type === "customer.subscription.updated") {
    const sub = evt.data.object as Stripe.Subscription;
    const companyId = String((sub.metadata as any)?.company_id || "");
    if (companyId) {
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const priceId = sub.items.data[0]?.price?.id || "";
      const cps = (sub as any).current_period_start;
      const cpe = (sub as any).current_period_end;

      const planFromMeta = String((sub.metadata as any)?.plan || "");
      const planFromPrice = priceId ? getPlanIdFromPriceId(priceId) : null;
      const plan = (["starter", "growth", "domination"].includes(planFromMeta)
        ? planFromMeta
        : planFromPrice || "starter") as "starter" | "growth" | "domination";

      const status =
        sub.status === "active" || sub.status === "trialing"
          ? "active"
          : sub.status === "past_due"
          ? "past_due"
          : sub.status === "canceled"
          ? "canceled"
          : "trial";

      await supabase
        .from("company_subscriptions")
        .upsert(
          {
            company_id: companyId,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            plan,
            status,
            started_at: cps ? new Date(cps * 1000).toISOString() : null,
            renewed_at: cpe ? new Date(cpe * 1000).toISOString() : null,
          },
          { onConflict: "company_id" }
        );

      await log.info("stripe_webhook", "Block 268000: Updated company subscription", {
        company_id: companyId,
        status,
        plan,
        stripe_subscription_id: sub.id,
      });
    }
  }

  if (evt.type === "customer.subscription.deleted") {
    const sub = evt.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    await supabase
      .from("workspace_billing_subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: false,
      })
      .eq("stripe_subscription_id", sub.id);

    await log.info('stripe_webhook', `Canceled workspace subscription`, {
      subscription_id: sub.id,
    });
  }

  // =========================================================
  // Block 12000: SmartSend Billing & Subscription Enforcement
  // Handle user-based subscriptions (Starter/Growth/Domination)
  // =========================================================
  
  if (evt.type === "customer.subscription.created" || evt.type === "customer.subscription.updated") {
    const sub = evt.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const priceId = sub.items.data[0]?.price?.id;
    const priceNickname = sub.items.data[0]?.price?.nickname?.toLowerCase() || "";
    const priceMetadata = sub.items.data[0]?.price?.metadata || {};
    
    // Map to plan (Starter/Growth/Domination)
    let plan = "starter";
    const planFromMetadata = (sub.metadata as any)?.plan || priceMetadata?.plan_type;
    if (planFromMetadata && ["starter", "growth", "domination"].includes(planFromMetadata)) {
      plan = planFromMetadata;
    } else if (priceNickname.includes("starter")) plan = "starter";
    else if (priceNickname.includes("growth")) plan = "growth";
    else if (priceNickname.includes("domination")) plan = "domination";
    
    // Get user_id from metadata or lookup by customer_id
    let userId = (sub.metadata as any)?.user_id;
    
    if (!userId) {
      // Lookup user by customer_id in profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      
      if (profile) {
        userId = profile.id;
      }
    }
    
    if (userId) {
      // Check for partner referral code in metadata
      const partnerReferralCode = (sub.metadata as any)?.partner_referral_code;
      let partnerId = null;
      
      if (partnerReferralCode) {
        // Get partner by referral code
        const { data: partner } = await supabase
          .from("partners")
          .select("id")
          .eq("referral_code", partnerReferralCode)
          .eq("status", "active")
          .maybeSingle();
        
        if (partner) {
          partnerId = partner.id;
        }
      }
      
      // Upsert subscription in Block 12000 subscriptions table
      await supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            plan: plan,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            status: sub.status,
            current_period_end: ((sub as any).current_period_end
              ? new Date((sub as any).current_period_end * 1000).toISOString()
              : null),
            partner_id: partnerId,
            partner_referral_code: partnerReferralCode || null,
          },
          { onConflict: "user_id" }
        );
      
      // Block 23760: Activate partner referral if subscription becomes active
      if (partnerId && sub.status === "active") {
        // Get subscription record ID
        const { data: subscriptionRecord } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .single();
        
        const subscriptionRecordId = subscriptionRecord?.id;
        
        // Check if referral exists
        const { data: existingReferral } = await supabase
          .from("partner_referrals")
          .select("id, status")
          .eq("referred_user_id", userId)
          .eq("partner_id", partnerId)
          .maybeSingle();
        
        if (existingReferral) {
          // Update referral to active if it was pending
          if (existingReferral.status === "pending") {
            await supabase
              .from("partner_referrals")
              .update({
                status: "active",
                subscription_id: subscriptionRecordId,
                stripe_subscription_id: sub.id,
                activated_at: new Date().toISOString(),
              })
              .eq("id", existingReferral.id);
          }
        } else {
          // Create new referral if it doesn't exist
          await supabase
            .from("partner_referrals")
            .insert({
              partner_id: partnerId,
              referred_user_id: userId,
              referral_code: partnerReferralCode,
              subscription_id: subscriptionRecordId,
              stripe_subscription_id: sub.id,
              referral_source: "checkout",
              status: "active",
              activated_at: new Date().toISOString(),
            });
        }
      }
      
      await log.info('stripe_webhook', `Block 12000: Updated user subscription`, {
        user_id: userId,
        plan: plan,
        status: sub.status,
        subscription_id: sub.id,
        partner_id: partnerId,
      });
      
      // If subscription is past_due or canceled, stop all sending
      if (sub.status === "past_due" || sub.status === "canceled") {
        // Stop all active campaigns for this user
        await supabase
          .from("campaigns")
          .update({ status: "paused" })
          .eq("user_id", userId)
          .in("status", ["running", "sending", "active"]);
        
        // Block 23760: Cancel partner referral if subscription canceled
        if (partnerId && sub.status === "canceled") {
          await supabase
            .from("partner_referrals")
            .update({
              status: "canceled",
              canceled_at: new Date().toISOString(),
            })
            .eq("referred_user_id", userId)
            .eq("partner_id", partnerId);
        }
        
        await log.info('stripe_webhook', `Block 12000: Stopped campaigns due to subscription status`, {
          user_id: userId,
          status: sub.status,
        });
      }
    }
  }
  
  if (evt.type === "customer.subscription.deleted") {
    const sub = evt.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    
    // Update Block 12000 subscriptions table
    await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
      })
      .eq("stripe_subscription_id", sub.id);
    
    // Stop all campaigns for users with canceled subscriptions
    const { data: canceledSub } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    
    if (canceledSub) {
      await supabase
        .from("campaigns")
        .update({ status: "paused" })
        .eq("user_id", canceledSub.user_id)
        .in("status", ["running", "sending", "active"]);
    }
    
    await log.info('stripe_webhook', `Block 12000: Canceled user subscription`, {
      subscription_id: sub.id,
    });
  }
  
  if (evt.type === "invoice.payment_succeeded") {
    const invoice = evt.data.object as Stripe.Invoice;
    const invoiceAny = invoice as any;
    const customerId =
      typeof invoiceAny.customer === "string" ? invoiceAny.customer : invoiceAny.customer?.id;
    const subscriptionId =
      typeof invoiceAny.subscription === "string" ? invoiceAny.subscription : invoiceAny.subscription?.id;
    
    if (subscriptionId) {
      // Reactivate subscription if it was past_due
      await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("stripe_subscription_id", subscriptionId)
        .eq("status", "past_due");
      
      // Block 23690: Unlock send queue and clear recovery state
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      
      if (sub) {
        // Get workspace_id if available
        const { data: workspaceMember } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", sub.user_id)
          .limit(1)
          .maybeSingle();
        
        const workspaceId = workspaceMember?.workspace_id || "";
        
        // Unlock send queue
        await unlockSendQueue(workspaceId, sub.user_id);

        // Mirror status into profiles for UI enforcement (instant resume)
        await supabase
          .from("profiles")
          .update({ subscription_status: "active" })
          .eq("id", sub.user_id);
        
        await log.info('stripe_webhook', `Block 23690: Payment succeeded, recovery system cleared`, {
          subscription_id: subscriptionId,
          user_id: sub.user_id,
        });
      }
      
      await log.info('stripe_webhook', `Block 12000: Payment succeeded, subscription reactivated`, {
        subscription_id: subscriptionId,
      });
    }
  }
  
  if (evt.type === "invoice.payment_failed") {
    const invoice = evt.data.object as Stripe.Invoice;
    const invoiceAny = invoice as any;
    const customerId =
      typeof invoiceAny.customer === "string" ? invoiceAny.customer : invoiceAny.customer?.id;
    const subscriptionId =
      typeof invoiceAny.subscription === "string" ? invoiceAny.subscription : invoiceAny.subscription?.id;
    
    if (subscriptionId) {
      // Mark subscription as past_due
      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", subscriptionId);
      
      // Get subscription details
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      
      if (sub) {
        // Get workspace_id if available
        const { data: workspaceMember } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", sub.user_id)
          .limit(1)
          .maybeSingle();
        
        const workspaceId = workspaceMember?.workspace_id || "";

        // Block 23690: Lock send queue (immediate silence)
        await lockSendQueue(workspaceId, sub.user_id);

        // Mirror status into profiles for UI enforcement (instant pause)
        await supabase
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("id", sub.user_id);
        
        // Block 23690: Create recovery state (no outbound messaging in-app; silence)
        const { data: recoveryStateId } = await supabase.rpc("create_or_update_recovery_state", {
          p_workspace_id: workspaceId || null,
          p_user_id: sub.user_id,
          p_stripe_customer_id: customerId,
          p_subscription_id: subscriptionId,
          p_phase: "recover",
          p_stage: 0,
        });
        
        await log.info('stripe_webhook', `Block 23690: Payment failed, recovery system triggered`, {
          subscription_id: subscriptionId,
          user_id: sub.user_id,
          recovery_state_id: recoveryStateId,
        });
      }
      
      await log.info('stripe_webhook', `Block 12000: Payment failed, subscription marked past_due`, {
        subscription_id: subscriptionId,
      });
    }
  }

  // BLOCK 268000 — Simple failure handling for company subscriptions:
  // If Stripe marks invoice payment failed for a subscription that belongs to a company, mark it past_due.
  if (evt.type === "invoice.payment_failed") {
    const invoice = evt.data.object as Stripe.Invoice;
    const invoiceAny = invoice as any;
    const subscriptionId =
      typeof invoiceAny.subscription === "string" ? invoiceAny.subscription : invoiceAny.subscription?.id;
    if (subscriptionId) {
      await supabase
        .from("company_subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", subscriptionId);
    }
  }

  // Legacy handlers for user-based subscriptions (keep for backward compatibility)
  if (evt.type === "checkout.session.completed") {
    const s = evt.data.object as Stripe.Checkout.Session;
    const subId = s.subscription as string;
    const customerId = s.customer as string;
    const userId = s.metadata?.user_id as string;
    const sub = await stripe.subscriptions.retrieve(subId);

    // Map to user by customer ID or metadata
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();
      targetUserId = profile?.id;
    }

    if (!targetUserId) {
      await log.warn('stripe_webhook', 'User not found for customer', {
        customer_id: customerId,
        event_type: evt.type,
      });
      return NextResponse.json({ received: true });
    }

    const price = sub.items.data[0]?.price?.id || "";
    const status = sub.status;
    const cpe = (sub as any).current_period_end;
    const cps = (sub as any).current_period_start;

    // Update profile with subscription info
    await supabase
      .from("profiles")
      .update({
        stripe_subscription_id: sub.id,
        subscription_status: status,
        current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
        price_id: price,
        plan_nickname: price.includes("pro") ? "Pro" : price.includes("starter") ? "Starter" : "Free",
      })
      .eq("id", targetUserId);

    // Create/update billing_accounts
    const item = sub.items.data[0];
    const priceId = item.price.id;
    const currentStart = cps ? new Date(cps * 1000).toISOString() : null;
    const currentEnd = cpe ? new Date(cpe * 1000).toISOString() : null;

    await supabase.from("billing_accounts").upsert({
      user_id: targetUserId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_code: (item.price.nickname ?? 'metered') as string,
    }, { onConflict: 'user_id' });

    await supabase.rpc("billing_set_period", {
      p_user: targetUserId,
      p_start: currentStart,
      p_end: currentEnd,
    });

    // Set up metered billing if subscription uses usage-based pricing
    try {
      const { setupMeteredBilling } = await import("@/lib/stripe-metered-billing");
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", targetUserId)
        .limit(1)
        .maybeSingle();
      
      if (workspaceMember?.workspace_id) {
        // Signature varies across versions; keep best-effort and non-blocking.
        await (setupMeteredBilling as any)(workspaceMember.workspace_id, customerId);
      }
    } catch (e) {
      // Function may not exist, ignore
    }
  }

  return NextResponse.json({ received: true });
}
