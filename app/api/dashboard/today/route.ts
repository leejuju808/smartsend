import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;
  const now = new Date();
  const today = formatYmd(now);
  const tomorrow = formatYmd(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  try {
    // Preload campaign IDs (used for inbox automation stats)
    const { data: campaignsForWs } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);
    const campaignIds = (campaignsForWs || []).map((c: any) => c.id);

    // 1) Today's jobs (scheduled AND in-progress)
    const { data: jobsToday, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        status,
        job_value,
        scheduled_start_date,
        scheduled_end_date,
        deposit_required,
        deposit_paid,
        weather_risk_score,
        weather_risk_label,
        crew_name,
        lead_id,
        leads:lead_id (
          first_name,
          last_name,
          city,
          state,
          address,
          phone,
          email
        ),
        job_crew_assignments (
          crew:crews (
            id,
            name,
            color
          )
        )
      `)
      .eq("workspace_id", workspaceId)
      .or(
        `scheduled_start_date.eq.${today},and(scheduled_start_date.lte.${today},scheduled_end_date.gte.${today}),and(status.eq.in_progress,scheduled_start_date.lte.${today})`
      )
      .order("scheduled_start_date", { ascending: true });

    if (jobsError) {
      console.error("Jobs error:", jobsError);
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    // 2) Upcoming jobs with unpaid deposits (today + tomorrow)
    const { data: unpaidDeposits, error: depositError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        job_value,
        deposit_required,
        deposit_paid,
        scheduled_start_date,
        lead_id,
        leads:lead_id (
          first_name,
          last_name,
          city,
          state,
          address,
          phone
        )
      `)
      .eq("workspace_id", workspaceId)
      .in("scheduled_start_date", [today, tomorrow])
      .gt("deposit_required", 0)
      .order("scheduled_start_date", { ascending: true });

    if (depositError) {
      console.error("Deposit error:", depositError);
      return NextResponse.json({ error: depositError.message }, { status: 500 });
    }

    // Filter unpaid deposits in JS (Supabase doesn't support < comparison easily)
    const filteredUnpaid = (unpaidDeposits || []).filter((job: any) => {
      const depRequired = Number(job.deposit_required || 0);
      const depPaid = Number(job.deposit_paid || 0);
      return depRequired > 0 && depPaid < depRequired;
    });

    // 3) HOT proposals needing attention (not converted to job yet)
    const { data: hotProposals, error: hotError } = await supabase
      .from("proposals")
      .select(`
        id,
        amount,
        status,
        intent,
        confidence,
        view_heat_score,
        sent_at,
        job_id,
        lead_id,
        leads:lead_id (
          first_name,
          last_name,
          city,
          state,
          phone,
          email
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("intent", "HOT")
      .is("job_id", null)
      .in("status", ["sent", "viewed", "considering"])
      .order("sent_at", { ascending: false });

    if (hotError) {
      console.error("Hot proposals error:", hotError);
      return NextResponse.json({ error: hotError.message }, { status: 500 });
    }

    // 4) Block 268200: "Handled while you worked" proof line
    // Count unique homeowners contacted by automation today (guardrail + followups)
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    let autoHomeownersContactedToday = 0;
    if (campaignIds.length > 0) {
      const { data: autoMsgs } = await supabase
        .from("inbox_messages")
        .select(
          `
          id,
          thread_id,
          contact_id,
          received_at,
          automation_tag,
          threads:thread_id (
            id,
            campaign_id,
            contact_id
          )
        `
        )
        .not("automation_tag", "is", null)
        .gte("received_at", startOfToday.toISOString())
        .lte("received_at", endOfToday.toISOString())
        .order("received_at", { ascending: false })
        .limit(500);

      const seen = new Set<string>();
      for (const m of autoMsgs || []) {
        const th = (m as any).threads;
        const cid = (th?.campaign_id && campaignIds.includes(th.campaign_id))
          ? String(th.contact_id || (m as any).contact_id || "")
          : "";
        if (cid) seen.add(cid);
      }
      autoHomeownersContactedToday = seen.size;
    }

    // Compute meta summary
    const totalJobsToday = jobsToday?.length || 0;
    const totalValueToday = (jobsToday || []).reduce(
      (sum: number, j: any) => sum + Number(j.job_value || 0),
      0
    );

    const highRiskJobs = (jobsToday || []).filter(
      (j: any) => j.weather_risk_label === "high" || (j.weather_risk_score || 0) >= 0.75
    );

    const meta = {
      today,
      totalJobsToday,
      totalValueToday,
      highRiskJobsCount: highRiskJobs.length,
      unpaidDepositsCount: filteredUnpaid.length,
      hotProposalsCount: hotProposals?.length || 0,
      autoHomeownersContactedToday,
    };

    return NextResponse.json(
      {
        meta,
        jobsToday: jobsToday || [],
        unpaidDeposits: filteredUnpaid,
        hotProposals: hotProposals || [],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Today ops error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
