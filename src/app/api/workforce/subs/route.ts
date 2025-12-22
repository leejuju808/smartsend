// GET /api/workforce/subs - List subcontractors
// POST /api/workforce/subs - Create subcontractor

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || "active";
    const trade = searchParams.get("trade");
    const search = searchParams.get("search");

    let query = supabase
      .from("subcontractors")
      .select(`
        *,
        subcontractor_documents(count),
        sub_job_assignments(count),
        sub_performance_reviews(count)
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (trade) {
      query = query.eq("trade", trade);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching subcontractors:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate stats for each sub
    const subsWithStats = await Promise.all(
      (data || []).map(async (sub) => {
        // Get average performance score from new performance_scores table
        const { data: performanceScores } = await supabase
          .from("sub_performance_scores")
          .select("overall_score, qc_score, on_time_score")
          .eq("subcontractor_id", sub.id);

        let avgScore = 0;
        let avgQcScore = 0;
        let avgOnTimeScore = 0;
        if (performanceScores && performanceScores.length > 0) {
          const total = performanceScores.reduce((sum, p) => sum + (p.overall_score || 0), 0);
          avgScore = total / performanceScores.length;
          
          const qcTotal = performanceScores.reduce((sum, p) => sum + (p.qc_score || 0), 0);
          avgQcScore = qcTotal / performanceScores.length;
          
          const onTimeTotal = performanceScores.reduce((sum, p) => sum + (p.on_time_score || 0), 0);
          avgOnTimeScore = onTimeTotal / performanceScores.length;
        }

        // Fallback to old performance_reviews if no new scores
        if (avgScore === 0) {
          const { data: reviews } = await supabase
            .from("sub_performance_reviews")
            .select("rating_speed, rating_quality, rating_professionalism")
            .eq("sub_id", sub.id);

          if (reviews && reviews.length > 0) {
            const total = reviews.reduce((sum, r) => {
              return sum + (r.rating_speed + r.rating_quality + r.rating_professionalism) / 3;
            }, 0);
            avgScore = (total / reviews.length) * 20; // Convert 1-5 scale to 0-100
          }
        }

        // Get compliance status (use new function if available, fallback to old method)
        let complianceStatus = "incomplete";
        try {
          const { data: complianceResult } = await supabase.rpc(
            "get_sub_compliance_status_v2",
            { p_subcontractor_id: sub.id }
          );
          complianceStatus = complianceResult || "incomplete";
        } catch {
          // Fallback to old method
          const { data: docs } = await supabase
            .from("subcontractor_documents")
            .select("doc_type, expires_at")
            .eq("sub_id", sub.id);

          const hasW9 = docs?.some((d) => d.doc_type === "W9");
          const hasCOI = docs?.some((d) => d.doc_type === "COI" && (!d.expires_at || new Date(d.expires_at) >= new Date()));
          const hasLicense = docs?.some((d) => d.doc_type === "License");
          complianceStatus = hasW9 && hasCOI && hasLicense ? "compliant" : "incomplete";
        }

        // Get work orders completed count (new system)
        const { data: completedWorkOrders } = await supabase
          .from("sub_work_orders")
          .select("id", { count: "exact", head: true })
          .eq("subcontractor_id", sub.id)
          .eq("status", "paid");

        // Fallback to old job assignments if no work orders
        let jobsCompleted = completedWorkOrders?.length || 0;
        if (jobsCompleted === 0) {
          const { data: completedJobs } = await supabase
            .from("sub_job_assignments")
            .select("id", { count: "exact", head: true })
            .eq("sub_id", sub.id)
            .eq("status", "completed");
          jobsCompleted = completedJobs?.length || 0;
        }

        // Get outstanding payments
        const { data: outstandingPayments } = await supabase
          .from("sub_payments")
          .select("amount")
          .eq("work_order_id", 
            supabase
              .from("sub_work_orders")
              .select("id")
              .eq("subcontractor_id", sub.id)
          )
          .in("status", ["pending", "approved"]);

        const outstandingAmount = outstandingPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

        // Get performance tier
        let performanceTier = "No Rating";
        try {
          const { data: tier } = await supabase.rpc(
            "get_sub_performance_tier",
            { p_subcontractor_id: sub.id }
          );
          performanceTier = tier || "No Rating";
        } catch {
          if (avgScore >= 90) performanceTier = "Elite Subcontractor";
          else if (avgScore >= 80) performanceTier = "Approved Sub";
          else if (avgScore >= 70) performanceTier = "Monitor Closely";
          else if (avgScore > 0) performanceTier = "Do Not Use";
        }

        return {
          ...sub,
          avg_rating: Math.round(avgScore),
          avg_qc_score: Math.round(avgQcScore),
          avg_on_time_score: Math.round(avgOnTimeScore),
          compliance_status: complianceStatus,
          jobs_completed: jobsCompleted,
          outstanding_payments: outstandingAmount,
          performance_tier: performanceTier,
        };
      })
    );

    return NextResponse.json({ subcontractors: subsWithStats });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const body = await req.json();
    const { name, contact_name, phone, email, trade, status } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("subcontractors")
      .insert({
        company_id: companyId,
        name,
        contact_name: contact_name || null,
        phone: phone || null,
        email: email || null,
        trade: trade || "other",
        status: status || "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating subcontractor:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ subcontractor: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
