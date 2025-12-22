import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type HealthStatus = "green" | "yellow" | "red";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function computeHealth(input: {
  lastEstimateSentAtISO: string | null;
  followupsActive: boolean;
  followupsPaused: boolean;
  dashboardActive7d: boolean;
  paymentStatus: string | null;
  sendingPaused: boolean;
}): HealthStatus {
  // RED: follow-ups paused, payment issue, or sending blocked/paused
  if (input.sendingPaused) return "red";
  if (input.followupsPaused) return "red";
  if (input.paymentStatus && ["past_due", "canceled", "incomplete", "unpaid"].includes(input.paymentStatus)) {
    return "red";
  }

  // YELLOW: no estimate sent in 7 days (or never)
  if (!input.lastEstimateSentAtISO) return "yellow";
  if (new Date(input.lastEstimateSentAtISO).getTime() < new Date(isoDaysAgo(7)).getTime()) return "yellow";

  // GREEN: estimate sent + follow-ups active + dashboard activity last 7 days
  if (input.followupsActive && input.dashboardActive7d) return "green";

  // Default: needs attention but not hard-blocked
  return "yellow";
}

function computeOnboardingStatus(checklist: {
  accountCreated: boolean;
  companyInfoCompleted: boolean;
  firstEstimateCreated: boolean;
  firstEstimateSent: boolean;
  followupsActive: boolean;
  dashboardViewed: boolean;
  subscriptionActive: boolean;
}): "not_started" | "active" | "complete" {
  const started =
    checklist.firstEstimateCreated ||
    checklist.firstEstimateSent ||
    checklist.followupsActive ||
    checklist.dashboardViewed ||
    checklist.subscriptionActive;

  const complete =
    checklist.accountCreated &&
    checklist.companyInfoCompleted &&
    checklist.firstEstimateCreated &&
    checklist.firstEstimateSent &&
    checklist.followupsActive &&
    checklist.dashboardViewed &&
    checklist.subscriptionActive;

  if (complete) return "complete";
  if (started) return "active";
  return "not_started";
}

/**
 * POST /api/cron/client-ops-health
 * Runs daily. Updates client_ops.health_status and writes daily history rows.
 * Also writes internal daily snapshot payloads for founder clients.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Only operate on explicitly-tracked clients (rows in client_ops).
    const { data: opsRows, error: opsErr } = await sb
      .from("client_ops")
      .select(
        `
          id,
          company_id,
          founder,
          onboarding_status,
          health_status,
          roofing_companies:roofing_companies (
            id,
            name,
            workspace_id,
            phone_number,
            address,
            city,
            state,
            website
          )
        `
      )
      .limit(500);

    if (opsErr) {
      return NextResponse.json({ error: opsErr.message }, { status: 500 });
    }

    const nowISO = new Date().toISOString();
    const sevenDaysAgoISO = isoDaysAgo(7);
    const day = todayDateStr();

    let updated = 0;
    let historyUpserts = 0;
    let snapshotsUpserts = 0;

    for (const row of opsRows || []) {
      const companyId = (row as any).company_id as string;
      const company = (row as any).roofing_companies as any | null;
      const workspaceId = company?.workspace_id as string | null;

      // Pull signals (best-effort: if a table/column doesn't exist in a given env, skip gracefully).
      const [
        lastSentRes,
        followupsActiveRes,
        followupsPausedRes,
        dashboardActivityRes,
        subscriptionRes,
        sendingStateRes,
        estimatesCountRes,
        estimatesApprovedSumRes,
        delivery24hRes,
      ] = await Promise.all([
        sb
          .from("estimates")
          .select("sent_at")
          .eq("company_id", companyId)
          .not("sent_at", "is", null)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from("estimates")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("followup_status", "active"),
        sb
          .from("estimates")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("followup_status", "paused"),
        workspaceId
          ? sb
              .from("workspace_activity")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", workspaceId)
              .gte("created_at", sevenDaysAgoISO)
          : Promise.resolve({ data: null, error: null, count: 0 } as any),
        sb.from("company_subscriptions").select("status, plan").eq("company_id", companyId).maybeSingle(),
        sb.from("company_sending_state").select("paused, paused_reason, last_error, last_error_at").eq("company_id", companyId).maybeSingle(),
        sb.from("estimates").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        sb
          .from("estimates")
          .select("total", { count: "exact", head: false })
          .eq("company_id", companyId)
          .eq("status", "approved")
          .limit(5000),
        sb
          .from("delivery_logs")
          .select("status, created_at")
          .eq("company_id", companyId)
          .gte("created_at", isoDaysAgo(1))
          .limit(5000),
      ]);

      const lastEstimateSentAtISO = (lastSentRes.data as any)?.sent_at ?? null;
      const followupsActive = (followupsActiveRes as any).count > 0;
      const followupsPaused = (followupsPausedRes as any).count > 0;
      const dashboardActive7d = (dashboardActivityRes as any).count > 0;
      const paymentStatus = (subscriptionRes.data as any)?.status ?? null;
      const sendingPaused = !!(sendingStateRes.data as any)?.paused;

      const health = computeHealth({
        lastEstimateSentAtISO,
        followupsActive,
        followupsPaused,
        dashboardActive7d,
        paymentStatus,
        sendingPaused,
      });

      const companyInfoCompleted = !!(
        company?.name &&
        company?.phone_number &&
        company?.address &&
        company?.city &&
        company?.state
      );

      const firstEstimateCreated = ((estimatesCountRes as any).count || 0) > 0;
      const firstEstimateSent = !!lastEstimateSentAtISO;
      const subscriptionActive = paymentStatus === "active";
      const dashboardViewed = dashboardActive7d;

      const onboarding_status = computeOnboardingStatus({
        accountCreated: true,
        companyInfoCompleted,
        firstEstimateCreated,
        firstEstimateSent,
        followupsActive,
        dashboardViewed,
        subscriptionActive,
      });

      // Update client_ops
      const { error: updErr } = await sb
        .from("client_ops")
        .update({
          health_status: health,
          onboarding_status,
        })
        .eq("company_id", companyId);

      if (!updErr) updated++;

      // Upsert daily health row
      const { error: histErr } = await sb
        .from("client_ops_health_daily")
        .upsert(
          {
            company_id: companyId,
            day,
            health_status: health,
          },
          { onConflict: "company_id,day" }
        );
      if (!histErr) historyUpserts++;

      // Founder daily snapshot export (internal)
      if ((row as any).founder) {
        const deliveryRows = (delivery24hRes.data as any[]) || [];
        const sent24h = deliveryRows.filter((d) => d.status === "sent").length;
        const failed24h = deliveryRows.filter((d) => d.status === "failed").length;
        const blocked24h = deliveryRows.filter((d) => d.status === "blocked").length;

        const approvedRows = (estimatesApprovedSumRes.data as any[]) || [];
        const approvedRevenue = approvedRows.reduce((sum, e) => sum + (Number(e.total) || 0), 0);

        const payload = {
          captured_at: nowISO,
          company: {
            id: companyId,
            name: company?.name || null,
            workspace_id: workspaceId,
          },
          health: {
            health_status: health,
            onboarding_status,
            last_estimate_sent_at: lastEstimateSentAtISO,
            followups_active: followupsActive,
            followups_paused: followupsPaused,
            dashboard_active_7d: dashboardActive7d,
            payment_status: paymentStatus,
            sending_paused: sendingPaused,
            sending_pause_reason: (sendingStateRes.data as any)?.paused_reason || null,
            last_error: (sendingStateRes.data as any)?.last_error || null,
            last_error_at: (sendingStateRes.data as any)?.last_error_at || null,
          },
          revenue: {
            estimates_total_count: (estimatesCountRes as any).count || 0,
            estimates_approved_count: approvedRows.length,
            estimates_approved_revenue: approvedRevenue,
          },
          delivery_logs_24h: {
            sent: sent24h,
            failed: failed24h,
            blocked: blocked24h,
            total: deliveryRows.length,
          },
        };

        const { error: snapErr } = await sb
          .from("client_ops_daily_snapshots")
          .upsert(
            {
              company_id: companyId,
              snapshot_date: day,
              payload,
            },
            { onConflict: "company_id,snapshot_date" }
          );
        if (!snapErr) snapshotsUpserts++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: (opsRows || []).length,
      updated,
      health_history_upserts: historyUpserts,
      founder_snapshot_upserts: snapshotsUpserts,
    });
  } catch (error: any) {
    console.error("Error in /api/cron/client-ops-health:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "client-ops-health cron endpoint" });
}









