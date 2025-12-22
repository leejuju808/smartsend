import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contacts/merge
 * Merges two contacts together
 * 
 * Body: {
 *   primaryId: string,
 *   duplicateId: string,
 *   resolvedFields?: { name?, email?, phone?, ... }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { primaryId, duplicateId, resolvedFields = {} } = body;

    if (!primaryId || !duplicateId) {
      return NextResponse.json(
        { error: "primaryId and duplicateId are required" },
        { status: 400 }
      );
    }

    if (primaryId === duplicateId) {
      return NextResponse.json(
        { error: "Cannot merge a contact with itself" },
        { status: 400 }
      );
    }

    // Get workspace_id from contacts
    const { data: primaryContact } = await supabase
      .from("contacts")
      .select("workspace_id")
      .eq("id", primaryId)
      .single();

    if (!primaryContact) {
      return NextResponse.json(
        { error: "Primary contact not found" },
        { status: 404 }
      );
    }

    const workspaceId = primaryContact.workspace_id;

    // Verify duplicate contact exists and belongs to same workspace
    const { data: duplicateContact } = await supabase
      .from("contacts")
      .select("workspace_id, merged_into")
      .eq("id", duplicateId)
      .single();

    if (!duplicateContact) {
      return NextResponse.json(
        { error: "Duplicate contact not found" },
        { status: 404 }
      );
    }

    if (duplicateContact.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Contacts must belong to the same workspace" },
        { status: 400 }
      );
    }

    if (duplicateContact.merged_into) {
      return NextResponse.json(
        { error: "Duplicate contact has already been merged" },
        { status: 400 }
      );
    }

    // Get reason from body or default to 'manual'
    const reason = body.reason || 'manual';

    // Call the enhanced merge function (v2)
    const { data: mergedContactId, error } = await supabase.rpc(
      "merge_contacts_v2",
      {
        p_workspace_id: workspaceId,
        p_primary_contact_id: primaryId,
        p_duplicate_contact_id: duplicateId,
        p_reason: reason,
        p_merged_by: user.id,
      }
    );

    if (error) {
      console.error("Error merging contacts:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mergedContactId,
      message: "Contacts merged successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/contacts/merge:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

