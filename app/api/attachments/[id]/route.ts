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

// DELETE /api/attachments/[id] - Delete an attachment
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Check user has delete permission (owner, manager only)
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    // Get attachment details
    const { data: attachment, error: fetchError } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("attachments")
      .remove([attachment.storage_path]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      // Continue with DB deletion even if storage deletion fails
    }

    // Delete from database (this will trigger the storage_used update via trigger)
    const { error: deleteError } = await supabase
      .from("attachments")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Attachment delete error:", deleteError);
      return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
    }

    // Log activity
    await logContactActivity({
      orgId,
      contactId: attachment.contact_id,
      type: "note_added", // Using note_added as attachment type - can be extended later
      title: `Attachment deleted: ${attachment.file_name}`,
      description: `File removed: ${attachment.file_name}`,
      userId: user.id,
      meta: {
        attachment_id: attachment.id,
        file_name: attachment.file_name,
        event_type: "attachment_deleted",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

