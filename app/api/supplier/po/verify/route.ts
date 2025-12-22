// Block 241000 — SmartSend Roofing Supplier Hub v1
// POST /api/supplier/po/verify
// Crew delivery verification - upload photos and check items

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      po_id,
      crew_id,
      verified,
      discrepancies, // Array of {item: string, expected: number, received: number, notes: string}
      verification_photos, // Array of photo URLs
      notes,
    } = body;

    if (!po_id) {
      return NextResponse.json(
        { error: "po_id is required" },
        { status: 400 }
      );
    }

    // Check if verification already exists
    const { data: existingVerification } = await supabase
      .from("material_verification")
      .select("*")
      .eq("po_id", po_id)
      .maybeSingle();

    let verification;

    if (existingVerification) {
      // Update existing verification
      const { data: updated, error: updateError } = await supabase
        .from("material_verification")
        .update({
          crew_id: crew_id || existingVerification.crew_id,
          verified: verified !== undefined ? verified : existingVerification.verified,
          verified_at: verified ? new Date().toISOString() : existingVerification.verified_at,
          verified_by: verified ? user.id : existingVerification.verified_by,
          discrepancies: discrepancies ? JSON.stringify(discrepancies) : existingVerification.discrepancies,
          verification_photos: verification_photos ? JSON.stringify(verification_photos) : existingVerification.verification_photos,
          notes: notes || existingVerification.notes,
        })
        .eq("id", existingVerification.id)
        .select()
        .single();

      if (updateError) {
        console.error("Verification update error:", updateError);
        return NextResponse.json(
          { error: "Failed to update verification" },
          { status: 500 }
        );
      }

      verification = updated;
    } else {
      // Create new verification
      const { data: created, error: createError } = await supabase
        .from("material_verification")
        .insert({
          po_id,
          crew_id: crew_id || null,
          verified: verified !== undefined ? verified : false,
          verified_at: verified ? new Date().toISOString() : null,
          verified_by: verified ? user.id : null,
          discrepancies: discrepancies ? JSON.stringify(discrepancies) : '[]',
          verification_photos: verification_photos ? JSON.stringify(verification_photos) : '[]',
          notes: notes || null,
        })
        .select()
        .single();

      if (createError) {
        console.error("Verification creation error:", createError);
        return NextResponse.json(
          { error: "Failed to create verification" },
          { status: 500 }
        );
      }

      verification = created;
    }

    // Update PO status if verified
    if (verified) {
      await supabase
        .from("purchase_orders")
        .update({ status: 'verified' })
        .eq("id", po_id);
    }

    // If discrepancies found, create issue ticket (TODO)
    if (discrepancies && discrepancies.length > 0) {
      // TODO: Auto-create issue ticket for discrepancies
    }

    // Fetch complete verification with PO details
    const { data: completeVerification, error: fetchError } = await supabase
      .from("material_verification")
      .select(`
        *,
        purchase_orders:po_id (
          *,
          po_items (*),
          suppliers (*)
        ),
        crews:crew_id (*)
      `)
      .eq("id", verification.id)
      .single();

    return NextResponse.json({ 
      verification: completeVerification || verification,
      message: verified ? "Materials verified successfully" : "Verification saved",
    });
  } catch (error: any) {
    console.error("Error in POST /api/supplier/po/verify:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























