import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/financial/analytics
 * Get profit analytics (by crew, job type, supplier)
 * Query params: company_id, type (crew|job_type|supplier)
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const type = searchParams.get("type") || "all"; // crew, job_type, supplier, all

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    const results: any = {};

    // Profit by Crew
    if (type === "crew" || type === "all") {
      const { data: crewProfit, error: crewError } = await supabase
        .from("profit_by_crew")
        .select("*")
        .order("avg_margin", { ascending: false });

      if (!crewError) {
        results.crew = crewProfit || [];
      }
    }

    // Profit by Job Type
    if (type === "job_type" || type === "all") {
      const { data: jobTypeProfit, error: jobTypeError } = await supabase
        .from("profit_by_job_type")
        .select("*")
        .order("avg_margin", { ascending: false });

      if (!jobTypeError) {
        results.job_type = jobTypeProfit || [];
      }
    }

    // Profit by Supplier
    if (type === "supplier" || type === "all") {
      const { data: supplierProfit, error: supplierError } = await supabase
        .from("profit_by_supplier")
        .select("*")
        .order("total_profit", { ascending: false });

      if (!supplierError) {
        results.supplier = supplierProfit || [];
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Get profit analytics error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















