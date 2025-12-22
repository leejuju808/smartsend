import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/billing/cancel
 * Body: { workspace_id: string }
 *
 * No save offers. Immediate reality:
 * - Cancels Stripe subscription (best-effort)
 * - Pauses workspace outreach immediately (billing_canceled)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = String((body as any).workspace_id || "");
    if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

    // Must be owner/admin of the workspace to cancel.
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const role = String((membership as any).role || "");
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // 1) Pause outreach immediately (this is the product truth, independent of Stripe latency).
    const nowIso = new Date().toISOString();
    const { data: wsBefore } = await supabaseAdmin
      .from("workspaces")
      .select("first_canceled_at")
      .eq("id", workspaceId)
      .maybeSingle();
    const firstCanceledAt = String((wsBefore as any)?.first_canceled_at || "") || nowIso;

    await supabaseAdmin
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
      .eq("id", workspaceId);

    // 2) Cancel Stripe subscription best-effort (there are multiple billing tables in this repo).
    // Prefer: billing_accounts (user-based) -> billing_subscriptions (workspace-based) -> profiles.
    let canceledSubscriptionId: string | null = null;

    // (a) billing_accounts (user-based)
    try {
      const { data: acct } = await supabaseAdmin
        .from("billing_accounts")
        .select("stripe_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const subId = String((acct as any)?.stripe_subscription_id || "");
      if (subId) {
        await stripe.subscriptions.cancel(subId);
        canceledSubscriptionId = subId;
      }
    } catch (e) {
      console.warn("[billing/cancel] billing_accounts cancel failed", e);
    }

    // (b) billing_subscriptions (workspace-based) if not already canceled
    if (!canceledSubscriptionId) {
      try {
        const { data: wsSub } = await supabaseAdmin
          .from("billing_subscriptions")
          .select("stripe_subscription_id")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        const subId = String((wsSub as any)?.stripe_subscription_id || "");
        if (subId) {
          await stripe.subscriptions.cancel(subId);
          canceledSubscriptionId = subId;
        }
      } catch (e) {
        console.warn("[billing/cancel] billing_subscriptions cancel failed", e);
      }
    }

    // (c) profiles fallback
    if (!canceledSubscriptionId) {
      try {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("stripe_subscription_id")
          .eq("id", user.id)
          .maybeSingle();
        const subId = String((prof as any)?.stripe_subscription_id || "");
        if (subId) {
          await stripe.subscriptions.cancel(subId);
          canceledSubscriptionId = subId;
        }
      } catch (e) {
        console.warn("[billing/cancel] profiles cancel failed", e);
      }
    }

    // Mirror into profile for immediate UI enforcement (best-effort).
    try {
      await supabaseAdmin.from("profiles").update({ subscription_status: "canceled" }).eq("id", user.id);
    } catch {}

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        outreach: { state: "paused", paused_at: nowIso, paused_reason: "billing_canceled" },
        stripe: { canceled_subscription_id: canceledSubscriptionId },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[billing/cancel] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}





