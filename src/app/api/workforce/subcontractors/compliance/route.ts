// GET /api/workforce/subcontractors/compliance - List compliance docs
// POST /api/workforce/subcontractors/compliance - Upload compliance doc

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
    const subcontractorId = searchParams.get("subcontractor_id");
    const docType = searchParams.get("doc_type");
    const expiring = searchParams.get("expiring"); // days ahead

    let query = supabase
      .from("sub_compliance_docs")
      .select(`
        *,
        subcontractors!inner(id, name, company_id)
      `)
      .eq("subcontractors.company_id", companyId)
      .order("created_at", { ascending: false });

    if (subcontractorId) {
      query = query.eq("subcontractor_id", subcontractorId);
    }

    if (docType) {
      query = query.eq("doc_type", docType);
    }

    if (expiring) {
      const daysAhead = parseInt(expiring);
      query = query
        .not("expires_on", "is", null)
        .gte("expires_on", new Date().toISOString().split("T")[0])
        .lte("expires_on", new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching compliance docs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ compliance_docs: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/subcontractors/compliance:", error);
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
    const {
      subcontractor_id,
      doc_type,
      file_url,
      expires_on,
      cert_number,
      issuing_organization,
      notes,
    } = body;

    // Verify subcontractor belongs to company
    const { data: sub, error: subError } = await supabase
      .from("subcontractors")
      .select("id, company_id")
      .eq("id", subcontractor_id)
      .eq("company_id", companyId)
      .single();

    if (subError || !sub) {
      return NextResponse.json(
        { error: "Subcontractor not found or access denied" },
        { status: 404 }
      );
    }

    // Create compliance doc
    const { data: doc, error: docError } = await supabase
      .from("sub_compliance_docs")
      .insert({
        subcontractor_id,
        doc_type,
        file_url,
        expires_on,
        cert_number,
        issuing_organization,
        notes,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (docError) {
      console.error("Error creating compliance doc:", docError);
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    return NextResponse.json({ compliance_doc: doc }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/subcontractors/compliance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























