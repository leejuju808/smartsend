import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

function monthStartIso(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  return start.toISOString();
}

function safeNumber(n: any): number {
  const x = typeof n === "number" ? n : n == null ? 0 : Number(n);
  return Number.isFinite(x) ? x : 0;
}

type ClosedJobRow = {
  id: string;
  status?: string | null;
  closed_at?: string | null;
  closed_month?: string | null;
  closed_city?: string | null;
  closed_zip_code?: string | null;
  estimate_id?: string | null;
  originated_via_smartsend?: boolean | null;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startIso = monthStartIso();

    // Prefer company scoping (roofing jobs), fallback to active workspace.
    let companyId = await getCurrentCompanyId();
    const workspaceId = await getActiveWorkspaceId();

    if (!companyId && workspaceId) {
      const { data: c } = await supabase
        .from("roofing_companies")
        .select("id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      companyId = (c as any)?.id ?? null;
    }

    if (!companyId && !workspaceId) {
      return NextResponse.json({ error: "No active company/workspace" }, { status: 400 });
    }

    // Load completed jobs this month.
    // Prefer closed_at if present (Block 271100), otherwise fall back to created_at.
    const baseJobsQuery = supabase
      .from("jobs")
      .select(
        "id,status,closed_at,closed_month,closed_city,closed_zip_code,estimate_id,originated_via_smartsend,created_at"
      )
      .eq("status", "completed")
      .order("closed_at", { ascending: false, nullsFirst: false });

    let jobsRes: any;
    if (companyId) {
      jobsRes = await baseJobsQuery.eq("company_id", companyId).gte("closed_at", startIso);
      // Older jobs variants may not have company_id; fall back to workspace scoping if so.
      if ((jobsRes as any)?.error && String((jobsRes as any).error?.message || "").includes("company_id")) {
        jobsRes = await baseJobsQuery.eq("workspace_id", workspaceId as string).gte("closed_at", startIso);
      }
    } else {
      jobsRes = await baseJobsQuery.eq("workspace_id", workspaceId as string).gte("closed_at", startIso);
    }

    // If the schema doesn't have closed_at yet, fall back to created_at.
    let jobs: ClosedJobRow[] = (jobsRes?.data as any[]) || [];
    if ((jobsRes as any)?.error && String((jobsRes as any).error?.message || "").includes("closed_at")) {
      const fbQuery = supabase
        .from("jobs")
        .select("id,status,created_at,estimate_id,originated_via_smartsend")
        .eq("status", "completed")
        .gte("created_at", startIso)
        .order("created_at", { ascending: false });

      let fbRes: any;
      if (companyId) {
        fbRes = await fbQuery.eq("company_id", companyId);
        if ((fbRes as any)?.error && String((fbRes as any).error?.message || "").includes("company_id")) {
          fbRes = await fbQuery.eq("workspace_id", workspaceId as string);
        }
      } else {
        fbRes = await fbQuery.eq("workspace_id", workspaceId as string);
      }
      jobs = ((fbRes as any)?.data as any[]) || [];
    }

    const jobIds = jobs.map((j) => j.id);

    // Pull estimate totals for revenue (best-effort).
    const estimateIds = Array.from(new Set(jobs.map((j) => j.estimate_id).filter(Boolean))) as string[];
    const estimateTotalById = new Map<string, number>();

    if (estimateIds.length) {
      const { data: estimates } = await supabase
        .from("estimates")
        .select("id,total")
        .in("id", estimateIds);
      for (const e of estimates || []) {
        estimateTotalById.set((e as any).id, safeNumber((e as any).total));
      }
    }

    const estimatedRevenueWon = jobs.reduce((sum, j) => {
      const eid = j.estimate_id || "";
      return sum + (eid ? estimateTotalById.get(eid) || 0 : 0);
    }, 0);

    // Pull before/after photos for each job (best-effort).
    const photosByJob = new Map<string, { before?: string; after?: string }>();
    if (jobIds.length) {
      const { data: photos } = await supabase
        .from("job_progress_photos")
        .select("job_id,category,photo_url,uploaded_at")
        .in("job_id", jobIds)
        .in("category", ["before", "after"])
        .order("uploaded_at", { ascending: false });

      for (const p of photos || []) {
        const jobId = (p as any).job_id as string;
        const cat = (p as any).category as "before" | "after";
        const url = (p as any).photo_url as string;
        if (!jobId || !cat || !url) continue;

        const cur = photosByJob.get(jobId) || {};
        // Keep newest only (we ordered desc)
        if (cat === "before" && !cur.before) cur.before = url;
        if (cat === "after" && !cur.after) cur.after = url;
        photosByJob.set(jobId, cur);
      }
    }

    const closedJobs = jobs.map((j) => {
      const p = photosByJob.get(j.id) || {};
      return {
        job_id: j.id,
        closed_at: j.closed_at ?? null,
        month: j.closed_month ?? (j.closed_at ? new Date(j.closed_at).toISOString().slice(0, 7) : null),
        city: j.closed_city ?? null,
        zip_code: j.closed_zip_code ?? null,
        originated_via_smartsend: j.originated_via_smartsend ?? true,
        before_photo_url: p.before ?? null,
        after_photo_url: p.after ?? null,
        estimated_revenue: j.estimate_id ? estimateTotalById.get(j.estimate_id) || 0 : 0,
      };
    });

    return NextResponse.json({
      period: { month_start: startIso },
      top: {
        jobs_closed_this_month: jobs.length,
        estimated_revenue_won_this_month: estimatedRevenueWon,
      },
      closed_jobs: closedJobs,
    });
  } catch (error: any) {
    console.error("Error in /api/hard-evidence:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}



