import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Validate membership (cookie-derived workspace must be checked)
    const { data: isMember } = await supabase.rpc("is_workspace_member", {
      p_ws: workspaceId,
      p_uid: user.id,
    });
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createServiceClient();

    // =========================================================================
    // Outreach (system runs daily)
    // =========================================================================
    const { count: activeCampaignsCount } = await admin
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "running", "sending"]);

    const { data: lastSend } = await admin
      .from("activity_logs")
      .select("created_at")
      .eq("workspace_id", workspaceId)
      .eq("category", "sending")
      .in("type", ["campaign_email_sent", "followup_sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // =========================================================================
    // Replies (auto-sorted)
    // =========================================================================
    const since7d = daysAgoIso(7);

    const { count: replies7d } = await admin
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("direction", "inbound")
      .gte("created_at", since7d);

    const { count: hotReplies7d } = await admin
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("direction", "inbound")
      .eq("intent", "hot_lead")
      .gte("created_at", since7d);

    const { count: hotWaiting } = await admin
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("direction", "inbound")
      .eq("intent", "hot_lead")
      .eq("replied", false);

    // =========================================================================
    // Pipeline (Hot → Booked → Closed) — org pipeline stages + workspace contacts
    // =========================================================================
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    const orgId = (profile as any)?.org_id ?? null;
    let stageCounts: Array<{ id: string; name: string; count: number }> = [];

    if (orgId) {
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .eq("org_id", orgId)
        .eq("name", "Default Pipeline")
        .maybeSingle();

      const pipelineId = (pipeline as any)?.id ?? null;
      if (pipelineId) {
        const { data: stages } = await admin
          .from("pipeline_stages")
          .select("id,name,order_index")
          .eq("pipeline_id", pipelineId)
          .order("order_index", { ascending: true });

        const ordered = (stages ?? [])
          .filter((s: any) => ["Hot", "Booked", "Closed"].includes(String(s?.name)))
          .sort((a: any, b: any) => Number(a.order_index) - Number(b.order_index));

        // 3 stages only -> 3 count queries is fine and predictable
        const out: Array<{ id: string; name: string; count: number }> = [];
        for (const st of ordered) {
          const { count } = await admin
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("pipeline_stage_id", st.id);
          out.push({ id: st.id, name: st.name, count: count ?? 0 });
        }
        stageCounts = out;
      }
    }

    // =========================================================================
    // Replaceable operator proof (no owner names)
    // =========================================================================
    const { data: lastHuman } = await admin
      .from("activity_logs")
      .select("created_at")
      .eq("workspace_id", workspaceId)
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastHumanAt = (lastHuman as any)?.created_at ?? null;

    let jobsBookedSince = 0;
    {
      let q = admin
        .from("jobs_conversions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      if (lastHumanAt) q = q.gte("created_at", lastHumanAt);
      q = q.or("conversion_type.ilike.%book%,pipeline_stage.in.(booked,won)");
      const { count } = await q;
      jobsBookedSince = count ?? 0;
    }

    // =========================================================================
    // Predictability (history-only, no promises)
    // =========================================================================
    const weeksWindow = 8;
    const since8w = daysAgoIso(7 * weeksWindow);

    const { data: leads8w } = await admin
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since8w)
      .limit(5000);

    let avgHomeownersPerWeek = (leads8w?.length ?? 0) / weeksWindow;
    if (!Number.isFinite(avgHomeownersPerWeek)) avgHomeownersPerWeek = 0;

    // Booked jobs/week (roofing estimates approved)
    let avgBookedJobsPerWeek = 0;
    const { data: companies } = await admin
      .from("roofing_companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(100);

    const companyIds = (companies ?? []).map((c: any) => c.id).filter(Boolean);
    if (companyIds.length > 0) {
      const { data: approved } = await admin
        .from("estimates")
        .select("id")
        .in("company_id", companyIds)
        .not("approved_at", "is", null)
        .gte("approved_at", since8w)
        .limit(5000);
      avgBookedJobsPerWeek = (approved?.length ?? 0) / weeksWindow;
      if (!Number.isFinite(avgBookedJobsPerWeek)) avgBookedJobsPerWeek = 0;
    }

    // =========================================================================
    // Clean audit trail (SmartSend-sourced jobs)
    // =========================================================================
    const { data: conversions } = await admin
      .from("jobs_conversions")
      .select(
        `
        id,
        created_at,
        updated_at,
        conversion_type,
        pipeline_stage,
        job_type,
        estimated_value,
        probability,
        expected_close_date,
        closed_at,
        contact_id,
        campaign_id,
        contacts:contact_id(first_name,last_name,email)
      `
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    const auditTrail = (conversions ?? [])
      .filter((c: any) => Boolean(c.campaign_id)) // SmartSend-sourced = campaign-backed
      .slice(0, 50)
      .map((c: any) => {
        const contact = c.contacts;
        const contactName =
          contact
            ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email
            : "Unknown";
        return {
          id: c.id,
          date: c.created_at,
          contact_name: contactName,
          contact_email: contact?.email ?? null,
          outcome: c.pipeline_stage || c.conversion_type || "unknown",
          conversion_type: c.conversion_type ?? null,
          pipeline_stage: c.pipeline_stage ?? null,
          estimated_revenue: c.estimated_value ? Number(c.estimated_value) : 0,
        };
      });

    return NextResponse.json({
      ok: true,
      as_of: new Date().toISOString(),
      workspace_id: workspaceId,
      system: {
        outreach: {
          running_daily: (activeCampaignsCount ?? 0) > 0,
          active_campaigns: activeCampaignsCount ?? 0,
          last_outbound_at: (lastSend as any)?.created_at ?? null,
        },
        replies: {
          replies_last_7d: replies7d ?? 0,
          hot_replies_last_7d: hotReplies7d ?? 0,
          hot_waiting_unreplied: hotWaiting ?? 0,
        },
        pipeline: {
          stages: stageCounts,
        },
        predictability: {
          avg_homeowners_per_week: Number(avgHomeownersPerWeek.toFixed(1)),
          avg_booked_jobs_per_week: Number(avgBookedJobsPerWeek.toFixed(1)),
        },
      },
      operator_proof: {
        last_human_input_at: lastHumanAt,
        days_running_without_human_input: daysSince(lastHumanAt),
        jobs_booked_during_that_time: jobsBookedSince,
      },
      audit_trail: auditTrail,
    });
  } catch (error) {
    console.error("[Handover Summary] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}




