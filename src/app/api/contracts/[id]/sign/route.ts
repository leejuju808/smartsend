// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// API Route: Sign Contract
// POST /api/contracts/[id]/sign

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { signature_data_url, signed_by_name, signed_by_email } = body;

    if (!signature_data_url || !signed_by_name) {
      return NextResponse.json(
        { error: "signature_data_url and signed_by_name are required" },
        { status: 400 }
      );
    }

    // Get contract
    const { data: contract, error: contractError } = await supabase
      .from("contract_documents")
      .select(`
        *,
        proposals:proposal_id (*)
      `)
      .eq("id", id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    // Upload signature image to storage (optional - you can store as base64 in DB)
    let signature_url = null;
    if (signature_data_url) {
      // Convert base64 to blob and upload
      // For now, we'll store the signature data in the database
      // In production, you might want to upload to storage
    }

    // Update contract with signature
    const { data: updatedContract, error: updateError } = await supabase
      .from("contract_documents")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signed_by_name,
        signed_by_email: signed_by_email || null,
        signature_data: {
          signature_data_url,
          signed_at: new Date().toISOString(),
        },
        signed_url: signature_url || contract.pdf_url, // Use PDF URL or signature URL
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating contract:", updateError);
      return NextResponse.json(
        { error: "Failed to sign contract" },
        { status: 500 }
      );
    }

    // Trigger will automatically update proposal and lead status

    return NextResponse.json({
      contract: updatedContract,
      message: "Contract signed successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/contracts/[id]/sign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































