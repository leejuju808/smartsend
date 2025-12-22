// PUT /api/workforce/qc/templates/[id] - Update QC template
// DELETE /api/workforce/qc/templates/[id] - Delete QC template

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();

    const { data, error } = await supabase
      .from("qc_checklist_templates")
      .update(body)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      console.error("Error updating QC template:", error);
      return NextResponse.json(
        { error: "Failed to update QC template" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ template: data });
  } catch (error) {
    console.error("Error in QC template PUT:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { error } = await supabase
      .from("qc_checklist_templates")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      console.error("Error deleting QC template:", error);
      return NextResponse.json(
        { error: "Failed to delete QC template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in QC template DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























