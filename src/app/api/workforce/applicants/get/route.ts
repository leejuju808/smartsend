// GET /api/workforce/applicants/get - Return applicants grouped by status columns
// Block 251200 — Hiring Pipeline Kanban

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

    const { data, error } = await supabase
      .from("workforce_applicants")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching applicants:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group applicants by status
    const grouped = {
      new: [] as any[],
      review: [] as any[],
      interview: [] as any[],
      hired: [] as any[],
      rejected: [] as any[],
    };

    (data || []).forEach((applicant: any) => {
      const status = applicant.status || "new";
      if (grouped[status as keyof typeof grouped]) {
        grouped[status as keyof typeof grouped].push(applicant);
      }
    });

    return NextResponse.json(grouped);
  } catch (error: any) {
    console.error("Error in GET /api/workforce/applicants/get:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























