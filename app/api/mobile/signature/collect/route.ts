// Block 238000 — SmartSend Mobile App v1
// POST /api/mobile/signature/collect
// Collect on-site signature (for proposals, contracts, change orders)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate user
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
      document_type, // 'proposal', 'contract', 'change_order', 'estimate'
      document_id, // ID of the proposal/contract/change_order
      signature_data, // Base64 encoded signature image
      signer_name,
      signer_email,
      signer_phone,
      ip_address,
      location, // GPS coordinates if available
      notes,
    } = body;

    if (!document_type || !document_id || !signature_data) {
      return NextResponse.json(
        { error: "document_type, document_id, and signature_data are required" },
        { status: 400 }
      );
    }

    // Determine which table to update based on document_type
    let tableName = "";
    let statusField = "";

    switch (document_type) {
      case "proposal":
        tableName = "proposals";
        statusField = "status";
        break;
      case "contract":
        tableName = "contracts";
        statusField = "status";
        break;
      case "change_order":
        tableName = "change_orders";
        statusField = "status";
        break;
      case "estimate":
        tableName = "estimates";
        statusField = "status";
        break;
      default:
        return NextResponse.json(
          { error: "Invalid document_type" },
          { status: 400 }
        );
    }

    // Check if table exists and get document
    const { data: document, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", document_id)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { error: `${document_type} not found` },
        { status: 404 }
      );
    }

    // Upload signature image to storage
    const serviceClient = createClient();
    const signatureFileName = `signatures/${document_type}/${document_id}/${Date.now()}.png`;
    
    // Convert base64 to buffer
    const base64Data = signature_data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const { error: uploadError } = await serviceClient.storage
      .from("documents")
      .upload(signatureFileName, buffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Signature upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload signature", details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = serviceClient.storage
      .from("documents")
      .getPublicUrl(signatureFileName);

    const signatureUrl = urlData.publicUrl;

    // Save signature record
    const { data: signatureRecord, error: signatureError } = await supabase
      .from("signatures")
      .insert({
        document_type,
        document_id,
        signature_url: signatureUrl,
        signer_name: signer_name || null,
        signer_email: signer_email || null,
        signer_phone: signer_phone || null,
        signed_by: user.id,
        ip_address: ip_address || null,
        location: location || null,
        notes: notes || null,
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (signatureError) {
      console.error("Signature record error:", signatureError);
      // Continue anyway - signature is uploaded
    }

    // Update document status to 'signed' or 'approved'
    const updates: any = {
      [statusField]: "signed",
      signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedDocument, error: updateError } = await supabase
      .from(tableName)
      .update(updates)
      .eq("id", document_id)
      .select()
      .single();

    if (updateError) {
      console.error("Document update error:", updateError);
      // Signature is saved, so return success anyway
    }

    // Trigger automations based on document type
    if (document_type === "contract" && updatedDocument) {
      // Create job from signed contract
      await supabase.from("jobs").insert({
        lead_id: updatedDocument.lead_id,
        team_id: updatedDocument.team_id,
        stage: "approved",
        contract_value: updatedDocument.total_amount || updatedDocument.value,
        insurance: updatedDocument.insurance || false,
        notes: "Created from signed contract",
      });
    }

    return NextResponse.json({
      success: true,
      signature: signatureRecord,
      document: updatedDocument,
    });
  } catch (error: any) {
    console.error("Error in signature collect API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























