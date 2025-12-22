// GET /api/workforce/dashboard - Get workforce dashboard stats

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

    // Get employee counts by status
    const { data: employeesByStatus } = await supabase
      .from("workforce_employees")
      .select("status")
      .eq("company_id", companyId);

    const statusCounts = {
      active: 0,
      terminated: 0,
      seasonal: 0,
      on_leave: 0,
    };

    employeesByStatus?.forEach((emp) => {
      if (emp.status in statusCounts) {
        statusCounts[emp.status as keyof typeof statusCounts]++;
      }
    });

    // Get applicant counts by status
    const { data: applicantsByStatus } = await supabase
      .from("workforce_applicants")
      .select("status")
      .eq("company_id", companyId);

    const applicantCounts = {
      new: 0,
      review: 0,
      interview: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
    };

    applicantsByStatus?.forEach((app) => {
      if (app.status in applicantCounts) {
        applicantCounts[app.status as keyof typeof applicantCounts]++;
      }
    });

    // Get expiring certifications (next 30 days)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const { data: expiringCerts } = await supabase
      .from("workforce_certifications")
      .select(`
        *,
        employee:workforce_employees!inner(company_id, first_name, last_name)
      `)
      .eq("employee.company_id", companyId)
      .not("expiry_date", "is", null)
      .lte("expiry_date", futureDate.toISOString().split("T")[0])
      .gte("expiry_date", new Date().toISOString().split("T")[0])
      .order("expiry_date", { ascending: true })
      .limit(10);

    // Get training completion stats
    const { data: trainingStats } = await supabase.rpc("get_training_completion_stats", {
      _company_id: companyId,
    });

    // Get recent performance logs
    const { data: recentLogs } = await supabase
      .from("workforce_performance_logs")
      .select(`
        *,
        employee:workforce_employees!inner(company_id, first_name, last_name)
      `)
      .eq("employee.company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      employee_counts: statusCounts,
      applicant_counts: applicantCounts,
      expiring_certifications: expiringCerts || [],
      training_stats: trainingStats || [],
      recent_performance_logs: recentLogs || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/dashboard:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























