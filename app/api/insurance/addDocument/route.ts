import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/insurance/addDocument
 * Add an insurance document and trigger extraction
 * 
 * Body: {
 *   contact_id: string,
 *   attachment_id: string,
 *   document_type: 'claim_form' | 'scope_of_loss' | 'estimate' | 'supplement' | 'adjuster_report' | 'insurance_check' | 'policy_document' | 'other',
 *   file_name: string,
 *   file_type?: string,
 *   file_size?: number
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const {
      contact_id,
      attachment_id,
      document_type,
      file_name,
      file_type,
      file_size,
    } = body;

    if (!contact_id || !document_type || !file_name) {
      return NextResponse.json(
        { error: "Missing required fields: contact_id, document_type, file_name" },
        { status: 400 }
      );
    }

    // Verify contact belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contact_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Create insurance document record
    const { data: document, error: documentError } = await supabase
      .from("insurance_documents")
      .insert({
        contact_id,
        workspace_id,
        attachment_id: attachment_id || null,
        document_type,
        file_name,
        file_type: file_type || null,
        file_size: file_size || null,
        extraction_status: "pending",
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (documentError) {
      console.error("Error creating insurance document:", documentError);
      return NextResponse.json({ error: documentError.message }, { status: 500 });
    }

    // Log event
    await supabase.from("insurance_events").insert({
      contact_id,
      workspace_id,
      event_type: "document_uploaded",
      event_description: `Insurance document uploaded: ${file_name}`,
      source: "manual",
      related_document_id: document.id,
      created_by: user.id,
    });

    // Trigger document extraction (async)
    // In production, this would call an edge function or worker
    try {
      await supabase.rpc("extract_insurance_document_data", {
        p_document_id: document.id,
        p_document_text: null, // Would extract from PDF in production
      });
    } catch (extractionError) {
      console.error("Error extracting document data:", extractionError);
      // Don't fail the request if extraction fails
    }

    // Recalculate insurance score
    try {
      await supabase.rpc("calculate_insurance_likelihood_score", {
        p_contact_id: contact_id,
      });
    } catch (scoreError) {
      console.error("Error recalculating insurance score:", scoreError);
    }

    return NextResponse.json({
      document,
      message: "Document added successfully. Extraction in progress.",
    });
  } catch (error: any) {
    console.error("Error in POST /api/insurance/addDocument:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































