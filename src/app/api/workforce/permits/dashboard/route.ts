// Block 257200 — Permit Tracking Dashboard (Workforce / Jobs)
// GET /api/workforce/permits/dashboard
//
// Surfaces:
// - Jobs where permits are not started / pending / submitted / rejected / expired
// - Permits expiring soon for active jobs
//
// This is the Workforce view that complements the roofing_jobs dashboard
// in Block 22400 but uses the jobs + permits tables.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    // 1) Jobs + aggregated permit readiness
    const { data: readiness, error: readinessError } = await supabase
      .from("jobs_permit_readiness")
      .select("*")
      .order("job_status", { ascending: true });

    if (readinessError) {
      console.error("Error loading jobs_permit_readiness:", readinessError);
      return NextResponse.json(
        { error: "Failed to load permit readiness" },
        { status: 500 }
      );
    }

    // 2) Permits expiring soon (view from Block 253100)
    const { data: expiringPermits, error: expiringError } = await supabase
      .from("permits_expiring_soon")
      .select("*")
      .order("expires_on", { ascending: true });

    if (expiringError) {
      console.error("Error loading permits_expiring_soon:", expiringError);
      return NextResponse.json(
        { error: "Failed to load expiring permits" },
        { status: 500 }
      );
    }

    // Build simple buckets for frontend:
    // - urgent: not_started / expired / rejected on active jobs
    // - attention: pending / submitted on active jobs
    const riskyJobs = (readiness || []).filter((row: any) => {
      const status = row.permit_summary_status;
      return (
        status === "not_started" ||
        status === "pending" ||
        status === "submitted" ||
        status === "expired" ||
        status === "rejected"
      );
    });

    const urgentJobs = riskyJobs.filter(
      (row: any) =>
        row.permit_summary_status === "not_started" ||
        row.permit_summary_status === "expired" ||
        row.permit_summary_status === "rejected"
    );

    const attentionJobs = riskyJobs.filter(
      (row: any) =>
        row.permit_summary_status === "pending" ||
        row.permit_summary_status === "submitted"
    );

    return NextResponse.json({
      readiness: readiness || [],
      riskyJobs,
      urgentJobs,
      attentionJobs,
      expiringPermits: expiringPermits || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/permits/dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}















