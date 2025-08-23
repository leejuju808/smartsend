import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/server/supabase";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs"; // ensures Node runtime for crypto

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-07-30.basil" });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/** Update profile helper */
async function setProfileByUserId(userId: string, patch: Record<string, any>) {
  await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
}

/** Can also resolve by stripe customer id if needed */
async function setProfileByCustomerId(customerId: string, patch: Record<string, any>) {
  await supabaseAdmin.from("profiles").update(patch).eq("stripe_customer_id", customerId);
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Get raw body for signature verification
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      /** After checkout session completes, tie stripe customer to our user id (stored in client_reference_id) */
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = (s.client_reference_id as string) || "";
        const customerId = (s.customer as string) || "";
        const email = (s.customer_details?.email || s.customer_email || "").toLowerCase();

        // Mark promo as redeemed if discount was applied
        const promoCodeId = (s.total_details?.breakdown?.discounts?.[0]?.discount?.promotion_code as string) || null;
        if (userId && promoCodeId) {
          await supabaseAdmin.from("user_promos")
            .update({ redeemed: true })
            .eq("user_id", userId)
            .eq("promotion_code_id", promoCodeId);
          
          // Log promo converted event
          try {
            await supabaseAdmin.from("events").insert({
              user_id: userId,
              event: "promo_converted",
              meta: { promotion_code: promoCodeId }
            });
          } catch (error) {
            // Don't fail if event logging fails
            console.error('Event logging error:', error);
          }
        }

        if (userId && customerId) {
          await setProfileByUserId(userId, {
            stripe_customer_id: customerId
          });
          break;
        }

        // Fallback: resolve by email if we have it
        if (email && customerId) {
          await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("email", email);
        }
        break;
      }

      /** Handle topup credit pack purchases */
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "payment" && s.metadata?.userId && s.metadata?.pack_qty) {
          const userId = s.metadata.userId as string;
          const qty = parseInt(s.metadata.pack_qty as string, 10) || 0;

          const { data: prof } = await supabaseAdmin
            .from("profiles").select("team_id").eq("id", userId).maybeSingle();

          if (prof?.team_id && qty > 0) {
            await supabaseAdmin.rpc("add_team_credits", { tid: prof.team_id, n: qty });
            // log event
            await supabaseAdmin.from("events").insert({
              user_id: userId, event: "topup_purchased", meta: { qty }
            });
          }
        }
        break;
      }

      /** Created or updated subscription → set pro + save ids + period end */
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        const status = sub.status; // trialing, active, past_due, canceled, etc.
        const periodEnd = (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null;

        // Map Stripe -> our status
        const appStatus =
          status === "active" || status === "trialing" ? "pro" :
          status === "past_due" ? "pro" : // keep pro but you might restrict if unpaid too long
          "free";

        await setProfileByCustomerId(customerId, {
          subscription_status: appStatus,
          stripe_subscription_id: sub.id,
          subscription_current_period_end: periodEnd
        });

        // Handle referral conversion for new Pro users
        if (event.type === "customer.subscription.created" && (status === "active" || status === "trialing")) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          
          if (profile?.id) {
            // Find and mark referral as converted
            const { data: referral } = await supabaseAdmin
              .from("referrals")
              .select("inviter")
              .eq("invitee", profile.id)
              .eq("status", "joined")
              .maybeSingle();
            
            if (referral?.inviter) {
              // Mark referral as converted
              await supabaseAdmin.from("referrals")
                .update({ status: "converted" })
                .eq("invitee", profile.id);
              
              // Grant referral credits to inviter
              await supabaseAdmin.rpc("increment_referral_credits", { referrer: referral.inviter });
            }
          }
        }

        // Find the metered item on this subscription and update team
        const meteredPrice = process.env.NEXT_PUBLIC_STRIPE_METERED_PRICE_ID!;
        const usageItem = sub.items.data.find(i => (i.price?.id === meteredPrice));
        const usageItemId = usageItem?.id || null;

        // Period window
        const periodStart = (sub as any).current_period_start ? new Date((sub as any).current_period_start * 1000).toISOString() : null;
        const periodEndTeam = (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null;

        // Resolve team for this owner and update with usage tracking info
        if (usageItemId) {
          const { data: owner } = await supabaseAdmin
            .from("profiles")
            .select("id, team_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();

          if (owner?.team_id) {
            await supabaseAdmin.from("teams").update({
              stripe_usage_item_id: usageItemId,
              current_period_start: periodStart,
              current_period_end: periodEndTeam
            }).eq("id", owner.team_id);
          }
        }

        // Record subscription event for new subscriptions
        if (event.type === "customer.subscription.created") {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          if (profile?.id) {
            // Capture plan information (monthly vs annual)
            const plan = sub.items.data[0]?.price?.recurring?.interval; // 'month' | 'year'
            await recordEvent(profile.id, "subscribed_pro", { 
              stripe_sub: sub.id,
              plan 
            });
            
            // Mark onboarding step as complete
            await supabaseAdmin.rpc("merge_onboarding_step", { uid: profile.id, k: "upgrade" });
            
            // Generate referral code if user doesn't have one yet
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("id, referral_code")
              .eq("id", profile.id)
              .maybeSingle();
            
            if (!prof?.referral_code) {
              const crypto = await import("crypto");
              const code = crypto.randomBytes(5).toString("hex"); // 10-char
              await supabaseAdmin.from("profiles").update({ referral_code: code }).eq("id", profile.id);
            }
            
            // Create team for new Pro user if they don't have one
            const { data: existingTeam } = await supabaseAdmin
              .from("teams")
              .select("id")
              .eq("owner_id", profile.id)
              .maybeSingle();
              
            let teamId = existingTeam?.id;
            if (!teamId) {
              const { data: createdTeam } = await supabaseAdmin
                .from("teams")
                .insert({ name: "My Team", owner_id: profile.id })
                .select()
                .single();
              teamId = createdTeam.id;
              
              // Update profile with team_id
              await supabaseAdmin.from("profiles").update({ team_id: teamId }).eq("id", profile.id);
              
              // Add owner to team_members
              await supabaseAdmin.from("team_members").upsert({ 
                team_id: teamId, 
                user_id: profile.id, 
                role: "owner" 
              });
            }
          }
        }
        break;
      }

      /** Canceled subscription → flip to free */
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = (sub.customer as string) || "";
        await setProfileByCustomerId(customerId, {
          subscription_status: "free",
          stripe_subscription_id: sub.id,
          subscription_current_period_end: null
        });
        break;
      }

      /** Successful invoice payment (good checkpoint, optional) */
      case "invoice.payment_succeeded": {
        // noop; handled by subscription.updated above
        break;
      }

      /** Payment failed → you may notify or downgrade later if needed */
      case "invoice.payment_failed": {
        // optional: log or email
        break;
      }

      default:
        // ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Webhook handler failed" }, { status: 500 });
  }
} 