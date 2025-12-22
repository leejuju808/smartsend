// Block 12800 — SmartSend Bulk Actions v1
// POST /api/contacts/bulk - Bulk operations for contacts
// Supports: tags (add/remove), status updates, list moves, suppression, delete

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { logActivity } from "@/lib/activity";

type BulkAction =
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "update_status"; status: string }
  | { type: "move_to_list"; listId: string; duplicate?: boolean }
  | { type: "suppress"; reason?: string }
  | { type: "delete" };

const CHUNK_SIZE = 100; // Process contacts in batches of 100

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Check user role for delete action
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  const userRole = membership?.role || "viewer";
  const isManagerOrOwner = userRole === "owner" || userRole === "manager";

  const body = await req.json().catch(() => ({}));
  const { contactIds, action }: { contactIds: string[]; action: BulkAction } = body;

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json(
      { error: "contactIds array is required" },
      { status: 400 }
    );
  }

  if (!action || !action.type) {
    return NextResponse.json(
      { error: "action is required" },
      { status: 400 }
    );
  }

  // Check permissions for delete
  if (action.type === "delete" && !isManagerOrOwner) {
    return NextResponse.json(
      { error: "Only managers and owners can delete contacts" },
      { status: 403 }
    );
  }

  // Verify all contacts belong to workspace
  const { data: contacts, error: verifyError } = await supabase
    .from("contacts")
    .select("id, email, workspace_id")
    .eq("workspace_id", workspaceId)
    .in("id", contactIds);

  if (verifyError) {
    return NextResponse.json(
      { error: verifyError.message },
      { status: 500 }
    );
  }

  const validContactIds = contacts?.map((c) => c.id) || [];
  if (validContactIds.length === 0) {
    return NextResponse.json(
      { error: "No valid contacts found" },
      { status: 404 }
    );
  }

  if (validContactIds.length !== contactIds.length) {
    return NextResponse.json(
      {
        error: "Some contacts not found or unauthorized",
        validCount: validContactIds.length,
        requestedCount: contactIds.length,
      },
      { status: 403 }
    );
  }

  try {
    let result: { updated: number; message: string };

    switch (action.type) {
      case "add_tag": {
        result = await handleAddTag(
          supabase,
          workspaceId,
          user.id,
          validContactIds,
          action.tag
        );
        break;
      }

      case "remove_tag": {
        result = await handleRemoveTag(
          supabase,
          workspaceId,
          user.id,
          validContactIds,
          action.tag
        );
        break;
      }

      case "update_status": {
        result = await handleUpdateStatus(
          supabase,
          workspaceId,
          user.id,
          validContactIds,
          action.status
        );
        break;
      }

      case "move_to_list": {
        result = await handleMoveToList(
          supabase,
          workspaceId,
          user.id,
          validContactIds,
          action.listId,
          action.duplicate || false
        );
        break;
      }

      case "suppress": {
        result = await handleSuppress(
          supabase,
          workspaceId,
          user.id,
          contacts!,
          action.reason || "manual"
        );
        break;
      }

      case "delete": {
        result = await handleDelete(
          supabase,
          workspaceId,
          user.id,
          validContactIds
        );
        break;
      }

      default:
        return NextResponse.json(
          { error: "Invalid action type" },
          { status: 400 }
        );
    }

    // Log activity
    await logActivity({
      workspaceId,
      actorId: user.id,
      eventType: `bulk_${action.type}`,
      description: result.message,
      metadata: {
        contactCount: result.updated,
        action: action.type,
      },
    }).catch(() => {
      // Ignore logging errors
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper: Add tag to contacts in chunks
async function handleAddTag(
  supabase: any,
  workspaceId: string,
  userId: string,
  contactIds: string[],
  tag: string
): Promise<{ updated: number; message: string }> {
  const normalizedTag = tag.trim().toLowerCase();
  let updated = 0;

  // Process in chunks
  for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
    const chunk = contactIds.slice(i, i + CHUNK_SIZE);
    
    for (const contactId of chunk) {
      const { error } = await supabase.rpc("add_contact_tag", {
        p_workspace_id: workspaceId,
        p_contact_id: contactId,
        p_tag: normalizedTag,
        p_auto_tagged: false,
        p_created_by: userId,
      });

      if (!error) {
        updated++;
      }
    }
  }

  return {
    updated,
    message: `Added tag '${tag}' to ${updated} contact${updated !== 1 ? "s" : ""}.`,
  };
}

// Helper: Remove tag from contacts in chunks
async function handleRemoveTag(
  supabase: any,
  workspaceId: string,
  userId: string,
  contactIds: string[],
  tag: string
): Promise<{ updated: number; message: string }> {
  const normalizedTag = tag.trim().toLowerCase();
  let updated = 0;

  // Process in chunks
  for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
    const chunk = contactIds.slice(i, i + CHUNK_SIZE);
    
    for (const contactId of chunk) {
      const { error } = await supabase.rpc("remove_contact_tag", {
        p_workspace_id: workspaceId,
        p_contact_id: contactId,
        p_tag: normalizedTag,
      });

      if (!error) {
        updated++;
      }
    }
  }

  return {
    updated,
    message: `Removed tag '${tag}' from ${updated} contact${updated !== 1 ? "s" : ""}.`,
  };
}

// Helper: Update lead_status for contacts
async function handleUpdateStatus(
  supabase: any,
  workspaceId: string,
  userId: string,
  contactIds: string[],
  status: string
): Promise<{ updated: number; message: string }> {
  // Validate status
  const validStatuses = [
    "HOT",
    "WARM",
    "FOLLOW_UP",
    "NEW",
    "NOT_INTERESTED",
    "OUT_OF_SCOPE",
  ];
  
  const normalizedStatus = status.toUpperCase();
  if (!validStatuses.includes(normalizedStatus)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  let updated = 0;

  // Process in chunks
  for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
    const chunk = contactIds.slice(i, i + CHUNK_SIZE);
    
    const { error } = await supabase
      .from("contacts")
      .update({ lead_status: normalizedStatus, updated_at: new Date().toISOString() })
      .in("id", chunk)
      .eq("workspace_id", workspaceId);

    if (!error) {
      updated += chunk.length;
    }
  }

  return {
    updated,
    message: `Updated ${updated} contact${updated !== 1 ? "s" : ""} to status '${normalizedStatus}'.`,
  };
}

// Helper: Move contacts to list
async function handleMoveToList(
  supabase: any,
  workspaceId: string,
  userId: string,
  contactIds: string[],
  listId: string,
  duplicate: boolean
): Promise<{ updated: number; message: string }> {
  // Verify list exists and belongs to workspace
  const { data: list, error: listError } = await supabase
    .from("contact_lists")
    .select("id, name")
    .eq("id", listId)
    .eq("workspace_id", workspaceId)
    .single();

  if (listError || !list) {
    throw new Error("List not found or unauthorized");
  }

  let updated = 0;

  // Process in chunks
  for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
    const chunk = contactIds.slice(i, i + CHUNK_SIZE);
    
    // If not duplicating, remove from other lists first
    if (!duplicate) {
      await supabase
        .from("contact_list_members")
        .delete()
        .in("contact_id", chunk)
        .eq("workspace_id", workspaceId);
    }

    // Add to target list (using upsert to handle duplicates)
    const membersToInsert = chunk.map((contactId) => ({
      workspace_id: workspaceId,
      list_id: listId,
      contact_id: contactId,
    }));

    const { error: insertError } = await supabase
      .from("contact_list_members")
      .upsert(membersToInsert, {
        onConflict: "list_id,contact_id",
        ignoreDuplicates: false,
      });

    if (!insertError) {
      updated += chunk.length;
    }
  }

  const action = duplicate ? "Copied" : "Moved";
  return {
    updated,
    message: `${action} ${updated} contact${updated !== 1 ? "s" : ""} to list '${list.name}'.`,
  };
}

// Helper: Suppress contacts
async function handleSuppress(
  supabase: any,
  workspaceId: string,
  userId: string,
  contacts: Array<{ id: string; email: string }>,
  reason: string
): Promise<{ updated: number; message: string }> {
  const validReasons = ["manual", "unsubscribed", "bounce", "complaint", "out_of_scope"];
  if (!validReasons.includes(reason)) {
    throw new Error(`Invalid reason. Must be one of: ${validReasons.join(", ")}`);
  }

  let updated = 0;

  // Process in chunks
  for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
    const chunk = contacts.slice(i, i + CHUNK_SIZE);
    
    const suppressions = chunk.map((c) => ({
      workspace_id: workspaceId,
      email: c.email.toLowerCase(),
      reason,
      created_by: "user",
      created_by_user_id: userId,
    }));

    const { error } = await supabase
      .from("suppression_list")
      .upsert(suppressions, {
        onConflict: "workspace_id,email",
        ignoreDuplicates: false,
      });

    if (!error) {
      updated += chunk.length;
    }
  }

  return {
    updated,
    message: `Suppressed ${updated} contact${updated !== 1 ? "s" : ""} (${reason}).`,
  };
}

// Helper: Soft delete contacts
async function handleDelete(
  supabase: any,
  workspaceId: string,
  userId: string,
  contactIds: string[]
): Promise<{ updated: number; message: string }> {
  let updated = 0;

  // Process in chunks - soft delete by setting deleted_at
  // First check if deleted_at column exists
  const { data: columnCheck } = await supabase.rpc("check_column_exists", {
    table_name: "contacts",
    column_name: "deleted_at",
  }).catch(() => ({ data: false }));

  if (columnCheck) {
    // Soft delete
    for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
      const chunk = contactIds.slice(i, i + CHUNK_SIZE);
      
      const { error } = await supabase
        .from("contacts")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", chunk)
        .eq("workspace_id", workspaceId);

      if (!error) {
        updated += chunk.length;
      }
    }
  } else {
    // Hard delete (fallback)
    for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
      const chunk = contactIds.slice(i, i + CHUNK_SIZE);
      
      // Remove from lists first
      await supabase
        .from("contact_list_members")
        .delete()
        .in("contact_id", chunk)
        .eq("workspace_id", workspaceId);

      // Delete contacts
      const { error } = await supabase
        .from("contacts")
        .delete()
        .in("id", chunk)
        .eq("workspace_id", workspaceId);

      if (!error) {
        updated += chunk.length;
      }
    }
  }

  return {
    updated,
    message: `Deleted ${updated} contact${updated !== 1 ? "s" : ""}.`,
  };
}





















































