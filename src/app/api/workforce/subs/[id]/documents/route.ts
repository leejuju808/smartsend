// GET /api/workforce/subs/[id]/documents - List documents
// POST /api/workforce/subs/[id]/documents - Upload document

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
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

    const { data, error } = await supabase
      .from("subcontractor_documents")
      .select("*")
      .eq("sub_id", id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subs/[id]/documents:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
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
    const { doc_type, file_url, expires_at } = body;

    if (!doc_type || !file_url) {
      return NextResponse.json({ error: "doc_type and file_url are required" }, { status: 400 });
    }

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

    const { data, error } = await supabase
      .from("subcontractor_documents")
      .insert({
        sub_id: id,
        doc_type,
        file_url,
        expires_at: expires_at || null,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating document:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subs/[id]/documents:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























