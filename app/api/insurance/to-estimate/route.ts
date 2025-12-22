// Block 222000 — SmartSend Insurance Scope Importer v1
// POST /api/insurance/to-estimate
// Converts parsed insurance line items into a SmartSend estimate

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { import_id, homeowner_id } = body;

    if (!import_id) {
      return NextResponse.json(
        { error: "Missing required field: import_id" },
        { status: 400 }
      );
    }

    // Get insurance import with line items
    const { data: insuranceImport, error: importError } = await supabase
      .from("insurance_imports")
      .select("id, company_id, homeowner_id, parsed_json, total_scope_value")
      .eq("id", import_id)
      .single();

    if (importError || !insuranceImport) {
      return NextResponse.json(
        { error: "Insurance import not found" },
        { status: 404 }
      );
    }

    // Verify user has access
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("id, owner_id")
      .eq("id", insuranceImport.company_id)
      .eq("owner_id", user.id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from("insurance_line_items")
      .select("*")
      .eq("import_id", import_id)
      .order("display_order", { ascending: true });

    if (lineItemsError) {
      return NextResponse.json(
        { error: "Failed to fetch line items" },
        { status: 500 }
      );
    }

    if (!lineItems || lineItems.length === 0) {
      return NextResponse.json(
        { error: "No line items found. Please parse the insurance scope first." },
        { status: 400 }
      );
    }

    // Use provided homeowner_id or fall back to import's homeowner_id
    const finalHomeownerId = homeowner_id || insuranceImport.homeowner_id;

    // Convert line items to estimate format
    const estimateLineItems = lineItems.map((item) => ({
      material: item.description,
      quantity: item.quantity,
      unit: item.unit || "ea",
      unit_price: item.unit_price || 0,
      total: item.total || (item.quantity * (item.unit_price || 0)),
      code: item.code,
      category: item.category || "materials",
      notes: item.notes || null,
    }));

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const taxRate = 0; // Can be configured per company
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    // Create estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .insert({
        company_id: insuranceImport.company_id,
        homeowner_id: finalHomeownerId,
        created_by: user.id,
        line_items: estimateLineItems,
        subtotal,
        tax_rate: taxRate,
        tax,
        total,
        notes: `Insurance scope imported from Xactimate PDF. Claim: ${insuranceImport.parsed_json?.claim_number || "N/A"}`,
        status: "draft",
      })
      .select()
      .single();

    if (estimateError) {
      console.error("Error creating estimate:", estimateError);
      return NextResponse.json(
        { error: "Failed to create estimate" },
        { status: 500 }
      );
    }

    // Create link between import and estimate
    await supabase
      .from("insurance_import_estimate_links")
      .insert({
        import_id,
        estimate_id: estimate.id,
      });

    // Update import status
    await supabase
      .from("insurance_imports")
      .update({ status: "converted" })
      .eq("id", import_id);

    // ============================================================
    // AUTOMATIONS (Superpower Add-ons)
    // ============================================================
    
    // 1. Auto-tag job as insurance claim if homeowner exists
    if (finalHomeownerId) {
      // Try to find associated job and tag it as insurance claim
      const { data: homeowner } = await supabase
        .from("homeowners")
        .select("job_id")
        .eq("id", finalHomeownerId)
        .single();

      if (homeowner?.job_id) {
        // Update job type to insurance claim
        await supabase
          .from("roofing_jobs")
          .update({ job_type: "insurance_driven_claim" })
          .eq("id", homeowner.job_id);
      }
    }

    // 2. Upsell recommendation if scope total is low
    const minJobValue = 5000; // Configurable per company
    if (total < minJobValue) {
      // Store recommendation in estimate notes or create a notification
      const upsellNote = `\n\n[AI Recommendation] This scope appears low ($${total.toLocaleString()}). Consider suggesting upgrade options to the homeowner.`;
      await supabase
        .from("estimates")
        .update({ 
          notes: (estimate.notes || "") + upsellNote 
        })
        .eq("id", estimate.id);
    }

    // 3. Validation alert if import incomplete
    const lineItemsCount = lineItems.length;
    if (lineItemsCount < 5) {
      // Notify contractor that certain line items may be missing
      const validationNote = `\n\n[Validation Alert] Only ${lineItemsCount} line items extracted. Certain items may be missing. Please review before sending.`;
      await supabase
        .from("estimates")
        .update({ 
          notes: (estimate.notes || "") + validationNote 
        })
        .eq("id", estimate.id);
    }

    return NextResponse.json({
      success: true,
      estimate_id: estimate.id,
      import_id,
      line_items_count: lineItems.length,
      total,
    });
  } catch (error: any) {
    console.error("Error in POST /api/insurance/to-estimate:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























