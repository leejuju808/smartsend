import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<any>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mailboxId = searchParams.get("id");

    if (!mailboxId) {
      return NextResponse.json({ error: "Mailbox ID is required" }, { status: 400 });
    }

    // Verify user owns the mailbox
    const { data: existingMailbox, error: fetchError } = await supabase
      .from("mailboxes")
      .select("id, user_id")
      .eq("id", mailboxId)
      .single();

    if (fetchError || !existingMailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    if (existingMailbox.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized to delete this mailbox" }, { status: 403 });
    }

    // Delete the mailbox
    const { error: deleteError } = await supabase
      .from("mailboxes")
      .delete()
      .eq("id", mailboxId);

    if (deleteError) {
      console.error("Error deleting mailbox:", deleteError);
      return NextResponse.json({ error: "Failed to delete mailbox" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Mailbox deleted successfully"
    });

  } catch (error) {
    console.error("Error in mailbox delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 