// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// API Route: Sign Contract (E-Signature)
// POST /api/contracts/sign

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const {
      contract_token,
      signature, // base64 encoded signature image
      signed_by_name,
      signed_by_email,
    } = body;

    if (!contract_token || !signature || !signed_by_name || !signed_by_email) {
      return NextResponse.json(
        { error: "contract_token, signature, signed_by_name, and signed_by_email are required" },
        { status: 400 }
      );
    }

    // Get contract by public token
    const { data: contract, error: contractError } = await supabase
      .from("estimates_contracts")
      .select(`
        *,
        proposal:estimates_proposals(
          *,
          estimate:estimates(
            *,
            company:roofing_companies(*),
            homeowner:homeowners(*)
          )
        )
      `)
      .eq("public_token", contract_token)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    // Check if already signed
    if (contract.status === "signed") {
      return NextResponse.json(
        { error: "Contract already signed" },
        { status: 400 }
      );
    }

    // Update contract with signature
    const { data: updatedContract, error: updateError } = await supabase
      .from("estimates_contracts")
      .update({
        homeowner_signature: signature,
        signature_date: new Date().toISOString(),
        signed_by_name,
        signed_by_email,
        status: "signed",
      })
      .eq("id", contract.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating contract:", updateError);
      return NextResponse.json(
        { error: "Failed to sign contract", details: updateError.message },
        { status: 500 }
      );
    }

    // The database trigger will automatically create the job link
    // But we can also manually trigger it here if needed

    // Return success response
    return NextResponse.json({
      ok: true,
      contract: updatedContract,
      message: "Contract signed successfully. Job will be created automatically.",
    });
  } catch (error: any) {
    console.error("Error in /api/contracts/sign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























