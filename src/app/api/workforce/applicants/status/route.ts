// POST /api/workforce/applicants/status - Update applicant status (drag & drop)
// Block 251200 — Hiring Pipeline Kanban

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ["new", "review", "interview", "hired", "rejected"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify applicant belongs to company
    const { data: existing } = await supabase
      .from("workforce_applicants")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Applicant not found" }, { status: 404 });
    }

    // Update status
    const { data, error } = await supabase
      .from("workforce_applicants")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating applicant status:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/workforce/applicants/status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























