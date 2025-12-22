import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/financial/overruns
 * Get cost overruns for a company or job
 * Query params: company_id, job_id (optional), acknowledged (optional)
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
    const jobId = searchParams.get("job_id");
    const acknowledged = searchParams.get("acknowledged");

    if (!companyId && !jobId) {
      return NextResponse.json(
        { error: "company_id or job_id is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("cost_overruns")
      .select("*")
      .order("created_at", { ascending: false });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (acknowledged !== null) {
      query = query.eq("acknowledged", acknowledged === "true");
    }

    const { data: overruns, error: overrunsError } = await query;

    if (overrunsError) {
      return NextResponse.json(
        { error: overrunsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ overruns: overruns || [] });
  } catch (error: any) {
    console.error("Get cost overruns error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/financial/overruns
 * Acknowledge a cost overrun
 */
export async function PATCH(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { overrun_id, acknowledged = true } = body;

    if (!overrun_id) {
      return NextResponse.json(
        { error: "overrun_id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cost_overruns")
      .update({
        acknowledged,
        acknowledged_at: acknowledged ? new Date().toISOString() : null,
        acknowledged_by: acknowledged ? user.id : null,
      })
      .eq("id", overrun_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ overrun: data });
  } catch (error: any) {
    console.error("Acknowledge cost overrun error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















