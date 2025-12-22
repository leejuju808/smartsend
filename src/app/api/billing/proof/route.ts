import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

function monthStartIso(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  return start.toISOString();
}

function safeNumber(n: unknown): number {
  const x = typeof n === "number" ? n : n == null ? 0 : Number(n);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

    // Verify membership (never trust client input)
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const nowIso = new Date().toISOString();
    const startIso = monthStartIso();

    // Campaign ids in this workspace
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);
    if (campErr) return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
    const campaignIds = (campaigns ?? []).map((c: any) => c.id).filter(Boolean);

    // Emails sent + replies (month-to-date)
    let emailsSent = 0;
    let replies = 0;
    if (campaignIds.length > 0) {
      const [{ count: sentCount }, { count: replyCount }] = await Promise.all([
        supabaseAdmin
          .from("send_logs")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .in("status", ["sent", "delivered"])
          .gte("sent_at", startIso)
          .lte("sent_at", nowIso),
        supabaseAdmin
          .from("smartsend_reply_events")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .gte("created_at", startIso)
          .lte("created_at", nowIso),
      ]);
      emailsSent = sentCount || 0;
      replies = replyCount || 0;
    }

    // Hot + Warm (current reality)
    const [{ count: hot }, { count: warm }] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "hot"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "warm"),
    ]);
    const hotLeads = hot || 0;
    const warmLeads = warm || 0;
    const hotWarm = hotLeads + warmLeads;

    // Jobs booked (month-to-date)
    let jobsBooked = 0;
    try {
      const { count } = await supabaseAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .neq("status", "cancelled")
        .gte("created_at", startIso)
        .lte("created_at", nowIso);
      jobsBooked = count || 0;
    } catch {
      jobsBooked = 0;
    }

    // Estimated job value (simple, locked logic)
    const estimatedJobValue = hotLeads * 10_000 + warmLeads * 5_000;

    // Amount due (Stripe upcoming invoice) - best effort.
    let amountDue: number | null = null;
    let currency: string | null = null;
    let stripeCustomerId: string | null = null;
    try {
      // Prefer org billing customer id from workspace.org_id if available
      const { data: ws } = await supabaseAdmin
        .from("workspaces")
        .select("org_id")
        .eq("id", workspaceId)
        .maybeSingle();
      const orgId = (ws as any)?.org_id as string | undefined;
      if (orgId) {
        const { data: billingInfo } = await supabaseAdmin.rpc("get_org_billing_info", { p_org_id: orgId });
        stripeCustomerId = String(billingInfo?.[0]?.stripe_customer_id || "");
      }
      if (!stripeCustomerId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("stripe_customer_id")
          .eq("id", user.id)
          .maybeSingle();
        stripeCustomerId = String((profile as any)?.stripe_customer_id || "");
      }

      if (stripeCustomerId) {
        const upcoming = await stripe.invoices.retrieveUpcoming({ customer: stripeCustomerId });
        amountDue = safeNumber((upcoming as any)?.amount_due) / 100;
        currency = String((upcoming as any)?.currency || "usd").toUpperCase();
      }
    } catch {
      amountDue = null;
      currency = null;
      stripeCustomerId = stripeCustomerId || null;
    }

    return NextResponse.json(
      {
        period: { month_start: startIso, as_of: nowIso },
        metrics: {
          emails_sent: emailsSent,
          replies,
          hot_warm: hotWarm,
          jobs_booked: jobsBooked,
          estimated_job_value: estimatedJobValue,
        },
        amount_due: amountDue,
        currency,
        stripe_customer_id: stripeCustomerId || null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[billing/proof] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}





