import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/financial/overhead
 * Get overhead settings for a company
 * Query params: company_id
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

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from("overhead_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError && settingsError.code !== "PGRST116") {
      return NextResponse.json(
        { error: settingsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ settings: settings || null });
  } catch (error: any) {
    console.error("Get overhead settings error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/financial/overhead
 * Create or update overhead settings
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      company_id,
      monthly_overhead,
      allocation_method,
      percentage_rate,
      per_job_amount,
      per_labor_hour_rate,
    } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Verify user is owner of company
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("owner_id")
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !company || company.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized: Only company owner can update overhead settings" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("overhead_settings")
      .upsert({
        company_id,
        monthly_overhead,
        allocation_method: allocation_method || "percentage",
        percentage_rate,
        per_job_amount,
        per_labor_hour_rate,
      }, {
        onConflict: "company_id",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (error: any) {
    console.error("Update overhead settings error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















