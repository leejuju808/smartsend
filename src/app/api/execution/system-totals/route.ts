import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PRICE_BY_PLAN: Record<string, number> = { starter: 99, growth: 199, domination: 399 };

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

function inRange(n: number, min: number, max: number) {
  return n >= min && n <= max;
}

/**
 * GET /api/execution/system-totals
 * Admin-only: verifies aggregated proof numbers for BLOCK 267400.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: companies, error: compErr } = await supabaseAdmin
      .from("roofing_companies")
      .select("id, workspace_id")
      .eq("is_active", true);
    if (compErr) return NextResponse.json({ error: compErr.message }, { status: 500 });

    const companyIds = (companies || []).map((c: any) => c.id).filter(Boolean) as string[];
    const workspaceIds = (companies || []).map((c: any) => c.workspace_id).filter(Boolean) as string[];
    const activeRoofers = companyIds.length;

    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .in("workspace_id", workspaceIds);
    if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
    const campaignIds = (campaigns || []).map((c: any) => c.id).filter(Boolean) as string[];

    const [{ count: emailsSent }, { count: replies }, { count: hotWarm }, { count: bookedCallsRaw }] =
      await Promise.all([
        supabaseAdmin
          .from("send_logs")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .in("status", ["sent", "delivered"]),
        supabaseAdmin
          .from("smartsend_reply_events")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds),
        supabaseAdmin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("workspace_id", workspaceIds)
          .in("outreach_status", ["hot", "warm"]),
        supabaseAdmin
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .in("workspace_id", workspaceIds)
          .neq("status", "cancelled"),
      ]);

    const totalEmailsSent = emailsSent || 0;
    const totalReplies = replies || 0;
    const totalHotWarm = hotWarm || 0;
    const bookedCalls = bookedCallsRaw || 0;

    const { data: subs, error: subErr } = await supabaseAdmin
      .from("company_subscriptions")
      .select("company_id, status, plan")
      .in("company_id", companyIds)
      .eq("status", "active");
    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

    const payingCustomers = (subs || []).length;
    const mrr = (subs || []).reduce((sum: number, s: any) => {
      const plan = String(s.plan || "").toLowerCase();
      return sum + (PRICE_BY_PLAN[plan] || 0);
    }, 0);

    const checks = {
      active_roofers_eq_2: activeRoofers === 2,
      emails_sent_gte_350: totalEmailsSent >= 350,
      replies_28_42: inRange(totalReplies, 28, 42),
      hot_warm_14_20: inRange(totalHotWarm, 14, 20),
      booked_calls_4_8: inRange(bookedCalls, 4, 8),
      paying_customers_eq_2: payingCustomers === 2,
      mrr_eq_198: mrr === 198,
    };

    const ok = Object.values(checks).every(Boolean);

    return NextResponse.json(
      {
        ok,
        as_of: new Date().toISOString(),
        totals: {
          active_roofers: activeRoofers,
          emails_sent: totalEmailsSent,
          replies: totalReplies,
          hot_warm_leads: totalHotWarm,
          booked_calls: bookedCalls,
          paying_customers: payingCustomers,
          mrr,
        },
        checks,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("system-totals error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}








