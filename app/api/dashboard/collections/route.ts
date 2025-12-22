// Block 22410 — SmartSend Roofing Collections & Overdue Invoice Chase v1
// API Route: Get Collections Dashboard Data
// Returns overdue jobs, partially paid jobs, unpaid completed jobs, and aging buckets

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    // Fetch all jobs with payment status and lead info
    const { data: jobs, error } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        job_value,
        total_paid,
        balance_due,
        payment_status,
        days_overdue,
        scheduled_end_date,
        leads:lead_id(
          first_name,
          last_name,
          city,
          phone,
          email
        )
      `)
      .eq("workspace_id", workspaceId)
      .not("status", "in", "('cancelled','lost')")
      .order("days_overdue", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("Error fetching collections data:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Initialize aging buckets
    const buckets = {
      bucket_0_30: [] as any[],
      bucket_30_60: [] as any[],
      bucket_60_90: [] as any[],
      bucket_90_plus: [] as any[],
    };

    // Categorize jobs
    const overdue: any[] = [];
    const partial: any[] = [];
    const unpaid_completed: any[] = [];

    for (const job of jobs || []) {
      // Flatten lead data (Supabase returns it as an object or array depending on relationship)
      const lead = Array.isArray(job.leads) ? job.leads[0] : job.leads;
      const jobWithLead = {
        ...job,
        lead: lead || {},
      };

      // Categorize by payment status
      if (job.payment_status === "overdue") {
        overdue.push(jobWithLead);

        // Add to aging buckets
        const daysOverdue = job.days_overdue || 0;
        if (daysOverdue <= 30) {
          buckets.bucket_0_30.push(jobWithLead);
        } else if (daysOverdue <= 60) {
          buckets.bucket_30_60.push(jobWithLead);
        } else if (daysOverdue <= 90) {
          buckets.bucket_60_90.push(jobWithLead);
        } else {
          buckets.bucket_90_plus.push(jobWithLead);
        }
      } else if (job.payment_status === "partial") {
        partial.push(jobWithLead);
      } else if (
        job.payment_status === "unpaid" &&
        job.scheduled_end_date != null
      ) {
        unpaid_completed.push(jobWithLead);
      }
    }

    return NextResponse.json(
      {
        overdue,
        partial,
        unpaid_completed,
        buckets,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Collections dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

