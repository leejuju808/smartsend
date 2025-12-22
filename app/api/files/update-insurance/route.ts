// Block 17000 — Insurance Document Update API
// POST /api/files/update-insurance
// Updates insurance document data and contact information

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { logContactActivity } from "@/lib/contactActivity";

// Helper to get current org_id
async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { insuranceDocId, updates } = body;

    if (!insuranceDocId || !updates) {
      return NextResponse.json(
        { error: "insuranceDocId and updates are required" },
        { status: 400 }
      );
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get insurance doc
    const { data: insuranceDoc, error: docError } = await supabase
      .from("insurance_docs")
      .select("id, contact_id, org_id")
      .eq("id", insuranceDocId)
      .eq("org_id", orgId)
      .single();

    if (docError || !insuranceDoc) {
      return NextResponse.json({ error: "Insurance document not found" }, { status: 404 });
    }

    // Update insurance doc
    const updateData: Record<string, any> = {};
    
    if (updates.claim_number !== undefined) updateData.claim_number = updates.claim_number;
    if (updates.deductible !== undefined) updateData.deductible = updates.deductible;
    if (updates.acv !== undefined) updateData.acv = updates.acv;
    if (updates.rcv !== undefined) updateData.rcv = updates.rcv;
    if (updates.adjuster_name !== undefined) updateData.adjuster_name = updates.adjuster_name;
    if (updates.adjuster_phone !== undefined) updateData.adjuster_phone = updates.adjuster_phone;
    if (updates.adjuster_email !== undefined) updateData.adjuster_email = updates.adjuster_email;
    if (updates.inspection_date !== undefined) updateData.inspection_date = updates.inspection_date;
    if (updates.date_of_loss !== undefined) updateData.date_of_loss = updates.date_of_loss;
    if (updates.carrier_name !== undefined) updateData.carrier_name = updates.carrier_name;
    if (updates.policy_number !== undefined) updateData.policy_number = updates.policy_number;

    const { data: updatedDoc, error: updateError } = await supabase
      .from("insurance_docs")
      .update(updateData)
      .eq("id", insuranceDocId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating insurance doc:", updateError);
      return NextResponse.json({ error: "Failed to update insurance document" }, { status: 500 });
    }

    // Update contact with insurance information
    const contactUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Update revenue estimate if ACV/RCV available
    if (updatedDoc.rcv || updatedDoc.acv) {
      contactUpdates.estimated_job_value = updatedDoc.rcv || updatedDoc.acv;
    }

    await supabase
      .from("contacts")
      .update(contactUpdates)
      .eq("id", insuranceDoc.contact_id)
      .eq("org_id", orgId);

    // Log activity
    await logContactActivity({
      orgId,
      contactId: insuranceDoc.contact_id,
      type: "note_added",
      title: "Insurance document updated",
      description: `Updated insurance information: ${updatedDoc.carrier_name || "Insurance"} - Claim #${updatedDoc.claim_number || "N/A"}`,
      userId: user.id,
      meta: {
        insurance_doc_id: insuranceDocId,
        event_type: "insurance_doc_updated",
        updates: updateData,
      },
    });

    return NextResponse.json({
      success: true,
      insurance_doc: updatedDoc,
    });
  } catch (error: any) {
    console.error("Error updating insurance document:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































