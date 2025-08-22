import { NextResponse } from "next/server";
import {
  findUserIdByCustomerId,
  hasEventBeenProcessed,
  markEventProcessed,
  updateSubscriptionStatus,
} from "../_lib/db";
import { supabaseAdmin } from "@/server/supabase";
import { withIdempotency } from "../_lib/idempotency";

function mapStripeToInternal(status: string): "pro" | "past_due" | "canceled" | "free" {
  if (status === "active" || status === "trialing") return "pro";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "free";
}

export async function POST(req: Request) {
  // Test-mode: bypass signature verification and use mocked helpers
  if (process.env.NODE_ENV === "test") {
    const event = await req.json();
    const eventId = event.id as string;

    const already = await hasEventBeenProcessed(eventId);
    if (already) return NextResponse.json({ ok: true });

    await withIdempotency(eventId, async () => {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const customerId = session.customer as string | undefined;
          const metaUserId = session.metadata?.user_id as string | undefined;
          let userId: string | null = null;
          if (metaUserId) userId = metaUserId;
          else if (customerId) userId = await findUserIdByCustomerId(customerId);
          if (userId) {
            if (customerId) {
              await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
            }
            await updateSubscriptionStatus(userId, "pro");
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const userId = await findUserIdByCustomerId(sub.customer);
          if (userId) {
            const internal = mapStripeToInternal(sub.status);
            await updateSubscriptionStatus(userId, internal);
            // Referral credit: if converting to paid, mark converted and grant 1 bonus month
            if (internal === "pro") {
              const { data: refRows } = await supabaseAdmin
                .from("referrals")
                .select("id, inviter, status")
                .eq("invitee", userId)
                .order("created_at", { ascending: false })
                .limit(1);
              const refRow = refRows && refRows[0];
              if (refRow && refRow.status !== "converted") {
                await supabaseAdmin.from("referrals").update({ status: "converted" }).eq("id", refRow.id);
                const inviterId = (refRow as any).inviter as string | undefined;
                if (inviterId) {
                  const { data: prof } = await supabaseAdmin
                    .from("profiles")
                    .select("bonus_credit")
                    .eq("id", inviterId)
                    .maybeSingle();
                  const current = (prof as any)?.bonus_credit ?? 0;
                  await supabaseAdmin
                    .from("profiles")
                    .update({ bonus_credit: current + 1 })
                    .eq("id", inviterId)
                    .catch(() => {});
                }
              }
            }
          }
          break;
        }
        case "invoice.upcoming":
        case "invoice.finalized": {
          const inv = event.data.object;
          const customerId = inv.customer as string;
          const userId = await findUserIdByCustomerId(customerId);
          if (userId) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("bonus_credit, credit_months")
              .eq("id", userId)
              .maybeSingle();
            const bonus = Number((prof as any)?.bonus_credit ?? 0);
            const legacy = Number((prof as any)?.credit_months ?? 0);
            const credits = bonus > 0 ? bonus : legacy;
            const hasDiscount = !!(inv.total_discount_amounts && inv.total_discount_amounts.length);
            if (credits > 0 && !hasDiscount) {
              try {
                const StripeModule = await import("stripe");
                const s = new StripeModule.default(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-06-20" });
                let couponId = process.env.STRIPE_REFERRAL_COUPON_ID as string | undefined;
                if (!couponId) {
                  const c = await s.coupons.create({ percent_off: 100, duration: "once", name: "Referral credit" });
                  couponId = c.id;
                }
                await s.invoices.update(inv.id, { discounts: [{ coupon: couponId! }] } as any);
                if (bonus > 0) {
                  await supabaseAdmin.from("profiles").update({ bonus_credit: Math.max(0, bonus - 1) }).eq("id", userId).catch(() => {});
                } else if (legacy > 0) {
                  try {
                    await supabaseAdmin.rpc("add_credit_month", { p_user_id: userId, p_delta: -1 });
                  } catch {
                    const newBal = Math.max(0, legacy - 1);
                    await supabaseAdmin.from("profiles").update({ credit_months: newBal }).eq("id", userId).catch(() => {});
                  }
                }
              } catch {}
            }
          }
          break;
        }
        default:
          break;
      }
      await markEventProcessed(eventId);
    });

    return NextResponse.json({ ok: true });
  }

  // Production path: verify Stripe signature with raw body
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook secret not set" }, { status: 400 });

  let event: any;
  try {
    const StripeModule = await import("stripe");
    const stripe = new StripeModule.default(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-06-20" });
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (e) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventId = event.id as string;
  const already = await hasEventBeenProcessed(eventId);
  if (already) return NextResponse.json({ ok: true });

  await withIdempotency(eventId, async () => {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId = session.customer as string | undefined;
        const metaUserId = session.metadata?.user_id as string | undefined;
        let userId: string | null = null;
        if (metaUserId) userId = metaUserId;
        else if (customerId) userId = await findUserIdByCustomerId(customerId);
        if (userId) {
          if (customerId) {
            await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
          }
          await updateSubscriptionStatus(userId, "pro");
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = await findUserIdByCustomerId(sub.customer);
        if (userId) {
          const internal = mapStripeToInternal(sub.status);
          await updateSubscriptionStatus(userId, internal);
          if (internal === "pro") {
            const { data: refRows } = await supabaseAdmin
              .from("referrals")
              .select("id, inviter, status")
              .eq("invitee", userId)
              .order("created_at", { ascending: false })
              .limit(1);
            const refRow = refRows && refRows[0];
            if (refRow && refRow.status !== "converted") {
              await supabaseAdmin.from("referrals").update({ status: "converted" }).eq("id", refRow.id);
              const inviterId = (refRow as any).inviter as string | undefined;
              if (inviterId) {
                const { data: prof } = await supabaseAdmin
                  .from("profiles")
                  .select("bonus_credit")
                  .eq("id", inviterId)
                  .maybeSingle();
                const current = (prof as any)?.bonus_credit ?? 0;
                await supabaseAdmin
                  .from("profiles")
                  .update({ bonus_credit: current + 1 })
                  .eq("id", inviterId)
                  .catch(() => {});
              }
            }
          }
        }
        break;
      }
      default:
        if (event.type === "invoice.upcoming" || event.type === "invoice.finalized") {
          const inv = event.data.object;
          const customerId = inv.customer as string;
          const userId = await findUserIdByCustomerId(customerId);
          if (userId) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("bonus_credit, credit_months")
              .eq("id", userId)
              .maybeSingle();
            const bonus = Number((prof as any)?.bonus_credit ?? 0);
            const legacy = Number((prof as any)?.credit_months ?? 0);
            const credits = bonus > 0 ? bonus : legacy;
            const hasDiscount = !!(inv.total_discount_amounts && inv.total_discount_amounts.length);
            if (credits > 0 && !hasDiscount) {
              try {
                const StripeModule = await import("stripe");
                const s = new StripeModule.default(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-06-20" });
                let couponId = process.env.STRIPE_REFERRAL_COUPON_ID as string | undefined;
                if (!couponId) {
                  const c = await s.coupons.create({ percent_off: 100, duration: "once", name: "Referral credit" });
                  couponId = c.id;
                }
                await s.invoices.update(inv.id, { discounts: [{ coupon: couponId! }] } as any);
                if (bonus > 0) {
                  await supabaseAdmin.from("profiles").update({ bonus_credit: Math.max(0, bonus - 1) }).eq("id", userId).catch(() => {});
                } else if (legacy > 0) {
                  try {
                    await supabaseAdmin.rpc("add_credit_month", { p_user_id: userId, p_delta: -1 });
                  } catch {
                    const newBal = Math.max(0, legacy - 1);
                    await supabaseAdmin.from("profiles").update({ credit_months: newBal }).eq("id", userId).catch(() => {});
                  }
                }
              } catch {}
            }
          }
        }
        break;
    }
    await markEventProcessed(eventId);
  });

  return NextResponse.json({ ok: true });
}

