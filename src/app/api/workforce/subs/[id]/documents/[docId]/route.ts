// DELETE /api/workforce/subs/[id]/documents/[docId] - Delete document

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
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

    const { id, docId } = await params;

    // Verify subcontractor belongs to company
    const { data: sub } = await supabase
      .from("subcontractors")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!sub) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    // Verify document belongs to subcontractor
    const { data: doc } = await supabase
      .from("subcontractor_documents")
      .select("id")
      .eq("id", docId)
      .eq("sub_id", id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("subcontractor_documents")
      .delete()
      .eq("id", docId);

    if (error) {
      console.error("Error deleting document:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/subs/[id]/documents/[docId]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























