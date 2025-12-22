import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/insurance/update
 * Update insurance intelligence for a contact
 * 
 * Body: {
 *   contact_id: string,
 *   text?: string, // Optional text to analyze
 *   claim_type?: string,
 *   coverage_type?: string,
 *   deductible?: number,
 *   adjuster_status?: string,
 *   claim_status?: string,
 *   // ... other fields
 * }
 * 
 * Block 19000 — SmartSend AI Insurance Brain v1
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const { contact_id, text, ...updateFields } = body;

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
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

    // If text provided, run comprehensive intelligence analysis
    if (text) {
      const { data: analysisResult, error: analysisError } = await supabase.rpc(
        "analyze_insurance_intelligence",
        {
          p_contact_id: contact_id,
          p_text: text,
        }
      );

      if (analysisError) {
        console.error("Error analyzing insurance intelligence:", analysisError);
        return NextResponse.json(
          { error: analysisError.message },
          { status: 500 }
        );
      }
    }

    // Update insurance claims if fields provided
    if (Object.keys(updateFields).length > 0) {
      const claimUpdates: any = {};
      
      // Map update fields to claim fields
      if (updateFields.claim_type) claimUpdates.claim_type = updateFields.claim_type;
      if (updateFields.coverage_type) claimUpdates.coverage_type = updateFields.coverage_type;
      if (updateFields.deductible !== undefined) claimUpdates.deductible = updateFields.deductible;
      if (updateFields.adjuster_status) claimUpdates.adjuster_status = updateFields.adjuster_status;
      if (updateFields.claim_status) claimUpdates.claim_status = updateFields.claim_status;
      if (updateFields.acv !== undefined) claimUpdates.acv = updateFields.acv;
      if (updateFields.rcv !== undefined) claimUpdates.rcv = updateFields.rcv;
      if (updateFields.approval_likelihood) claimUpdates.approval_likelihood = updateFields.approval_likelihood;
      if (updateFields.supplement_potential) claimUpdates.supplement_potential = updateFields.supplement_potential;
      if (updateFields.next_best_action) claimUpdates.next_best_action = updateFields.next_best_action;
      if (updateFields.estimated_payout !== undefined) claimUpdates.estimated_payout = updateFields.estimated_payout;

      if (Object.keys(claimUpdates).length > 0) {
        claimUpdates.workspace_id = workspaceId;
        claimUpdates.updated_at = new Date().toISOString();

        const { error: updateError } = await supabase
          .from("insurance_claims")
          .upsert(
            {
              contact_id,
              ...claimUpdates,
            },
            {
              onConflict: "contact_id",
            }
          );

        if (updateError) {
          console.error("Error updating insurance claim:", updateError);
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 }
          );
        }
      }
    }

    // Generate insurance tasks if claim status changed
    if (updateFields.claim_status) {
      const { error: tasksError } = await supabase.rpc("generate_insurance_tasks", {
        p_contact_id: contact_id,
      });

      if (tasksError) {
        console.error("Error generating insurance tasks:", tasksError);
        // Don't fail the request if task generation fails
      }
    }

    // Get updated intelligence
    const { data: updatedIntelligence } = await supabase
      .from("insurance_intelligence")
      .select("*")
      .eq("contact_id", contact_id)
      .single();

    return NextResponse.json({
      ok: true,
      contact_id,
      intelligence: updatedIntelligence,
      message: "Insurance intelligence updated successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/insurance/update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































