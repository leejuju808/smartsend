// Block 256100 — Warranty Claims API
// POST /api/warranty/claims - Create warranty claim
// GET /api/warranty/claims?warranty_id=xxx - List claims for a warranty

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: List warranty claims
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const warrantyId = searchParams.get("warranty_id");
    const customerId = searchParams.get("customer_id");
    const status = searchParams.get("status");

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

    let query = supabase
      .from("warranty_claims")
      .select(`
        *,
        warranty:warranties(*),
        customer:customers(id, name, email, phone),
        job:jobs(id, title, address)
      `)
      .order("created_at", { ascending: false });

    if (warrantyId) {
      query = query.eq("warranty_id", warrantyId);
    }

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching warranty claims:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch warranty claims" },
        { status: 500 }
      );
    }

    return NextResponse.json({ claims: data || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GET /api/warranty/claims:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create warranty claim
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

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
    const {
      warranty_id,
      description,
      photos = [],
      issue_started_date,
    } = body;

    if (!warranty_id || !description) {
      return NextResponse.json(
        { error: "Missing required fields: warranty_id, description" },
        { status: 400 }
      );
    }

    // Create claim using the function
    const { data: claimId, error: claimError } = await supabase
      .rpc("create_warranty_claim", {
        p_warranty_id: warranty_id,
        p_description: description,
        p_photos: photos,
        p_issue_started_date: issue_started_date || null,
      });

    if (claimError) {
      console.error("Error creating warranty claim:", claimError);
      return NextResponse.json(
        { error: claimError.message || "Failed to create warranty claim" },
        { status: 500 }
      );
    }

    // Get the created claim
    const { data: claim, error: fetchError } = await supabase
      .from("warranty_claims")
      .select(`
        *,
        warranty:warranties(*),
        customer:customers(id, name, email, phone),
        job:jobs(id, title, address)
      `)
      .eq("id", claimId)
      .single();

    if (fetchError) {
      console.error("Error fetching created claim:", fetchError);
      return NextResponse.json(
        { error: "Claim created but failed to fetch details" },
        { status: 500 }
      );
    }

    // TODO: Trigger AI analysis for coverage likelihood
    // TODO: Auto-assign to PM if rules match
    // TODO: Send notification to office

    return NextResponse.json(
      { claim },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/warranty/claims:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















