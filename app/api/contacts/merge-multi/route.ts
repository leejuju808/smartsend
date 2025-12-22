import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contacts/merge-multi
 * Merges multiple contacts into one primary contact
 * 
 * Body: {
 *   primaryId: string,
 *   duplicateIds: string[],
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
    const { primaryId, duplicateIds, resolvedFields = {} } = body;

    if (!primaryId || !duplicateIds || !Array.isArray(duplicateIds)) {
      return NextResponse.json(
        { error: "primaryId and duplicateIds array are required" },
        { status: 400 }
      );
    }

    if (duplicateIds.length === 0) {
      return NextResponse.json(
        { error: "At least one duplicate contact ID is required" },
        { status: 400 }
      );
    }

    // Get workspace_id from primary contact
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

    // Verify all duplicate contacts exist and belong to same workspace
    const { data: duplicateContacts } = await supabase
      .from("contacts")
      .select("id, workspace_id, merged_into")
      .in("id", duplicateIds);

    if (!duplicateContacts || duplicateContacts.length !== duplicateIds.length) {
      return NextResponse.json(
        { error: "One or more duplicate contacts not found" },
        { status: 404 }
      );
    }

    // Check all belong to same workspace and aren't already merged
    for (const dup of duplicateContacts) {
      if (dup.workspace_id !== workspaceId) {
        return NextResponse.json(
          { error: "All contacts must belong to the same workspace" },
          { status: 400 }
        );
      }
      if (dup.merged_into) {
        return NextResponse.json(
          { error: `Contact ${dup.id} has already been merged` },
          { status: 400 }
        );
      }
    }

    // Merge each duplicate into primary sequentially
    const mergedIds: string[] = [];
    const errors: string[] = [];

    for (const duplicateId of duplicateIds) {
      try {
        const { data: mergedContactId, error } = await supabase.rpc(
          "merge_contacts",
          {
            p_workspace_id: workspaceId,
            p_primary_contact_id: primaryId,
            p_duplicate_contact_id: duplicateId,
            p_resolved_fields: resolvedFields,
            p_merged_by: user.id,
          }
        );

        if (error) {
          errors.push(`Failed to merge ${duplicateId}: ${error.message}`);
        } else {
          mergedIds.push(duplicateId);
        }
      } catch (err: any) {
        errors.push(`Failed to merge ${duplicateId}: ${err.message}`);
      }
    }

    if (mergedIds.length === 0) {
      return NextResponse.json(
        { error: "Failed to merge any contacts", errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      primaryId,
      mergedIds,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully merged ${mergedIds.length} contact(s)`,
    });
  } catch (error: any) {
    console.error("Error in POST /api/contacts/merge-multi:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

