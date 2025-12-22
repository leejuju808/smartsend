// /app/api/webhooks/stripe/route.ts
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPlanIdFromPriceId } from "@/lib/billing/stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature")!;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(raw, sig, endpointSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed.` }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const upsert = async (payload: {
    workspace_id: string; customer: string; subscription: Stripe.Subscription; plan: string;
  }) => {
    const s = payload.subscription as any;
    const period = s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null;
    const periodStart = s.current_period_start ? new Date(s.current_period_start * 1000).toISOString() : null;

    await supabase.from("billing_subscriptions").upsert({
      workspace_id: payload.workspace_id,
      stripe_customer_id: payload.customer,
      stripe_subscription_id: s.id,
      plan: payload.plan,
      status: s.status,
      current_period_start: periodStart,
      current_period_end: period,
      cancel_at_period_end: s.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString()
    }, { onConflict: "workspace_id" });
  };

  async function setWorkspaceOutreachStateFromSubscription(opts: {
    workspace_id: string;
    subscription_status: string | null;
  }) {
    const status = String(opts.subscription_status || "").toLowerCase();
    const isActive = status === "active" || status === "trialing";

    if (isActive) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("workspaces")
        .update({
          outreach_state: "running",
          outreach_paused_at: null,
          outreach_paused_reason: null,
          outreach_last_resumed_at: nowIso,
        })
        .eq("id", opts.workspace_id);
      return;
    }

    if (status === "canceled") {
      const nowIso = new Date().toISOString();
      let firstCanceledAt = nowIso;
      try {
        const { data: existingWs } = await supabase
          .from("workspaces")
          .select("first_canceled_at")
          .eq("id", opts.workspace_id)
          .maybeSingle();
        const existing = String((existingWs as any)?.first_canceled_at || "");
        if (existing) firstCanceledAt = existing;
      } catch {
        // best-effort only
      }

      await supabase
        .from("workspaces")
        .update({
          outreach_state: "paused",
          outreach_paused_at: nowIso,
          outreach_last_paused_at: nowIso,
          outreach_paused_reason: "billing_canceled",
          has_canceled_before: true,
          // preserve first cancellation timestamp once set
          first_canceled_at: firstCanceledAt,
          last_canceled_at: nowIso,
        })
        .eq("id", opts.workspace_id);
      return;
    }

    if (status === "past_due" || status === "unpaid") {
      const nowIso = new Date().toISOString();
      await supabase
        .from("workspaces")
        .update({
          outreach_state: "paused",
          outreach_paused_at: nowIso,
          outreach_last_paused_at: nowIso,
          outreach_paused_reason: "billing_past_due",
        })
        .eq("id", opts.workspace_id);
      return;
    }
  }

  // BLOCK 268000 — Roofing Company Subscription (Payment Moment v1)
  const upsertCompanySubscription = async (payload: {
    company_id: string;
    customer: string;
    subscription: Stripe.Subscription;
    plan: string;
  }) => {
    const s = payload.subscription as any;
    const periodEnd = s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null;
    const periodStart = s.current_period_start ? new Date(s.current_period_start * 1000).toISOString() : null;

    const status =
      s.status === "active" || s.status === "trialing"
        ? "active"
        : s.status === "past_due"
        ? "past_due"
        : s.status === "canceled"
        ? "canceled"
        : "trial";

    await supabase.from("company_subscriptions").upsert(
      {
        company_id: payload.company_id,
        stripe_customer_id: payload.customer,
        stripe_subscription_id: s.id,
        plan: payload.plan,
        status,
        started_at: periodStart,
        renewed_at: periodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );

    // BLOCK 267200: unlock SmartSend sending for the company owner by mirroring paid state into profiles.
    // This keeps "paid=true => 50/day" consistent across the send pipeline.
    try {
      const { data: company } = await supabase
        .from("roofing_companies")
        .select("owner_id")
        .eq("id", payload.company_id)
        .maybeSingle();

      const ownerId = (company as any)?.owner_id as string | undefined;
      if (ownerId) {
        const priceId = s.items?.data?.[0]?.price?.id ?? null;
        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: payload.customer,
            stripe_subscription_id: s.id,
            subscription_status: s.status ?? null,
            price_id: priceId,
            plan_nickname: payload.plan,
            current_period_end: periodEnd,
          })
          .eq("id", ownerId);
      }
    } catch (e) {
      console.error("BLOCK 267200: failed to mirror company subscription to profiles", e);
    }
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const customerId = String(s.customer);
      
      // CREDIT PURCHASE - Handle payment mode (one-time credit purchases)
      if (s.mode === "payment") {
        // Retrieve line items to get price_id
        const lineItems = await stripe.checkout.sessions.listLineItems(s.id, { limit: 1 });
        const priceId = lineItems.data[0]?.price?.id;
        const quantity = lineItems.data[0]?.quantity ?? 1;

        if (priceId) {
          // Map price IDs to credit amounts
          const creditsToAdd =
            priceId === process.env.STRIPE_PRICE_CREDITS_SMALL ? 500 :
            priceId === process.env.STRIPE_PRICE_CREDITS_MEDIUM ? 2000 :
            priceId === process.env.STRIPE_PRICE_CREDITS_LARGE ? 10000 :
            0;

          const totalCredits = creditsToAdd * quantity;

          if (totalCredits > 0) {
            // Find workspace by customer ID
            const { data: ws } = await supabase
              .from("workspaces")
              .select("id")
              .eq("stripe_customer_id", customerId)
              .single();

            if (ws?.id) {
              // Add credits to wallet
              const { error: creditError } = await supabase.rpc("add_credits", {
                workspace_id_input: ws.id,
                amount: totalCredits,
                reason_input: "purchase",
              });

              if (creditError) {
                console.error("Failed to add credits:", creditError);
              }
            }
          }
        }
        break;
      }

      // SUBSCRIPTION - Handle subscription mode (existing logic)
      const subId = s.subscription as string;
      if (subId) {
        const subscription = await stripe.subscriptions.retrieve(subId);
        const workspace_id = String(s.metadata?.workspace_id || "");
        const plan = String(s.metadata?.plan || "starter");
        await upsert({ workspace_id, customer: customerId, subscription, plan });
        if (workspace_id) {
          await setWorkspaceOutreachStateFromSubscription({
            workspace_id,
            subscription_status: (subscription as any)?.status ?? null,
          }).catch(() => null);
        }

        // BLOCK 268000 — company subscription (if this checkout is for a roofing company)
        const company_id = String(s.metadata?.company_id || "");
        if (company_id) {
          const companyPlan = String(s.metadata?.plan || "starter");
          await upsertCompanySubscription({
            company_id,
            customer: customerId,
            subscription,
            plan: companyPlan,
          });
        }
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const s = event.data.object as Stripe.Subscription;
      const workspace_id = String((s.metadata as any)?.workspace_id || "");
      const company_id = String((s.metadata as any)?.company_id || "");
      // If not on metadata, you can look up via the customer in your table
      let plan = "starter";
      const priceId = s.items.data[0]?.price?.id;
      if (priceId) {
        // Prefer v1 plan mapping for starter/growth/domination
        const mapped = getPlanIdFromPriceId(priceId);
        if (mapped) plan = mapped;
        else if (priceId === process.env.STRIPE_PRICE_PRO_ID) plan = "pro";
        else if (priceId === process.env.STRIPE_PRICE_SCALE_ID) plan = "scale";
      }
      // Find workspace by customer if metadata missing
      if (!workspace_id) {
        const { data: row } = await supabase
          .from("billing_subscriptions")
          .select("workspace_id")
          .eq("stripe_customer_id", s.customer as string)
          .maybeSingle();
        if (row?.workspace_id) {
          await upsert({ workspace_id: row.workspace_id, customer: s.customer as string, subscription: s, plan });
          await setWorkspaceOutreachStateFromSubscription({
            workspace_id: row.workspace_id,
            subscription_status: (s as any)?.status ?? null,
          }).catch(() => null);
        }
      } else {
        await upsert({ workspace_id, customer: s.customer as string, subscription: s, plan });
        await setWorkspaceOutreachStateFromSubscription({
          workspace_id,
          subscription_status: (s as any)?.status ?? null,
        }).catch(() => null);
      }

      // BLOCK 268000 — Sync to company_subscriptions if present
      if (company_id) {
        const planFromMeta = String((s.metadata as any)?.plan || "");
        const effectivePlan = (["starter", "growth", "domination"].includes(planFromMeta)
          ? planFromMeta
          : plan) as string;
        await upsertCompanySubscription({
          company_id,
          customer: s.customer as string,
          subscription: s,
          plan: effectivePlan,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const s = event.data.object as Stripe.Subscription;
      await supabase.from("billing_subscriptions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", s.id);

      // BLOCK 269800: cancellation = immediate reality. Pause workspace outreach.
      try {
        const { data: row } = await supabase
          .from("billing_subscriptions")
          .select("workspace_id")
          .eq("stripe_subscription_id", s.id)
          .maybeSingle();
        const wid = String((row as any)?.workspace_id || "");
        if (wid) {
          await setWorkspaceOutreachStateFromSubscription({
            workspace_id: wid,
            subscription_status: "canceled",
          }).catch(() => null);
        }
      } catch {
        // best-effort only
      }

      // BLOCK 268000 — cancel company subscription if it matches
      await supabase
        .from("company_subscriptions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", s.id);
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Handle invoice payments from payment links
      if (session.payment_link && session.metadata?.invoice_type) {
        const paymentLinkId = session.payment_link;
        const invoiceId = session.metadata?.invoice_id;
        
        if (!invoiceId) {
          // Find invoice by payment link ID
          const { data: invoice } = await supabase
            .from("invoices")
            .select("id, amount")
            .eq("stripe_payment_link_id", paymentLinkId)
            .single();
          
          if (invoice) {
            const paymentAmount = (session.amount_total || 0) / 100; // Convert from cents
            const paymentIntentId = session.payment_intent as string;
            
            // Record payment
            await supabase.from("payments").insert({
              invoice_id: invoice.id,
              stripe_payment_intent: paymentIntentId,
              stripe_charge_id: session.id,
              amount: paymentAmount,
              currency: "usd",
              status: "succeeded",
              received_at: new Date().toISOString(),
            });
            
            // Refresh invoice status
            await supabase.rpc("refresh_invoice_status", {
              p_invoice_id: invoice.id,
            });
          }
        }
      }
      break;
    }
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const amount = (paymentIntent.amount || 0) / 100; // Convert from cents
      
      // BLOCK 221000: Handle payment schedules and milestones
      const invoiceId = paymentIntent.metadata?.invoice_id;
      const milestoneId = paymentIntent.metadata?.milestone_id;
      const scheduleId = paymentIntent.metadata?.schedule_id;
      
      // Check if payment already recorded in stripe_transactions
      const { data: existingTransaction } = await supabase
        .from("stripe_transactions")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();
      
      if (!existingTransaction) {
        // Record transaction in stripe_transactions table
        const { data: transaction } = await supabase
          .from("stripe_transactions")
          .insert({
            invoice_id: invoiceId || null,
            milestone_id: milestoneId || null,
            schedule_id: scheduleId || null,
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: paymentIntent.latest_charge as string || null,
            stripe_customer_id: paymentIntent.customer as string || null,
            amount: amount,
            currency: paymentIntent.currency || "usd",
            status: "succeeded",
            payment_method_type: paymentIntent.payment_method_types?.[0] || null,
            raw_event_data: paymentIntent as any,
          })
          .select()
          .single();
        
        // Database triggers will automatically:
        // - Update milestone status (paid/partial)
        // - Update schedule status
        // - Update job status if final payment
      }
      
      // Legacy invoice handling (existing code)
      if (invoiceId) {
        // Check if payment already recorded in payments table
        const { data: existing } = await supabase
          .from("payments")
          .select("id")
          .eq("stripe_payment_intent", paymentIntent.id)
          .maybeSingle();
        
        if (!existing) {
          // Record payment
          const { data: payment } = await supabase.from("payments").insert({
            invoice_id: invoiceId,
            stripe_payment_intent: paymentIntent.id,
            stripe_charge_id: paymentIntent.latest_charge as string || null,
            amount: amount,
            currency: paymentIntent.currency || "usd",
            status: "succeeded",
            received_at: new Date().toISOString(),
          }).select().single();
          
          // Calculate and update invoice balance (triggers will handle status update)
          try {
            await supabase.rpc("calculate_invoice_balance", {
              p_invoice_id: invoiceId,
            });
          } catch {
            // Ignore if function doesn't exist
          }
          
          // Refresh invoice status
          try {
            await supabase.rpc("refresh_invoice_status", {
              p_invoice_id: invoiceId,
            });
          } catch {
            // Ignore if function doesn't exist
          }
          
          // Log payment event (trigger will also log, but this ensures it)
          const { data: invoice } = await supabase
            .from("invoices")
            .select("status, balance_due")
            .eq("id", invoiceId)
            .single();
          
          if (invoice) {
            const eventType = invoice.status === "paid" ? "paid" : "partially_paid";
            try {
              await supabase.from("invoice_events").insert({
                invoice_id: invoiceId,
                event: eventType,
                metadata: {
                  payment_id: payment?.id,
                  amount: amount,
                  stripe_payment_intent: paymentIntent.id,
                  balance_due: invoice.balance_due,
                },
              });
            } catch {
              // Ignore if table doesn't exist
            }
          }
        }
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      // BLOCK 221000: Handle failed payments for milestones
      const invoiceId = paymentIntent.metadata?.invoice_id;
      const milestoneId = paymentIntent.metadata?.milestone_id;
      
      // Update stripe_transactions status
      if (paymentIntent.metadata?.milestone_id || paymentIntent.metadata?.invoice_id) {
        await supabase
          .from("stripe_transactions")
          .update({
            status: "failed",
            raw_event_data: paymentIntent as any,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntent.id);
      }
      
      // Legacy invoice handling
      if (invoiceId) {
        // Log payment failed event
        try {
          await supabase.from("invoice_events").insert({
            invoice_id: invoiceId,
            event: "payment_failed",
            metadata: {
              stripe_payment_intent: paymentIntent.id,
              error: paymentIntent.last_payment_error?.message || "Payment failed",
            },
          });
        } catch {
          // Ignore if table doesn't exist
        }
      }
      break;
    }
    default:
      // ignore others
      break;
  }

  return NextResponse.json({ received: true });
}

export const config = {
  api: { bodyParser: false } // ensure raw body (handled by Next.js app router automatically if using req.text())
};