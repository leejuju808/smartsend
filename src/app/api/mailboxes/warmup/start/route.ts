import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<any>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { mailboxId } = body;

    if (!mailboxId) {
      return NextResponse.json({ error: "Mailbox ID is required" }, { status: 400 });
    }

    // Verify user owns the mailbox
    const { data: existingMailbox, error: fetchError } = await supabase
      .from("mailboxes")
      .select("id, user_id, is_active")
      .eq("id", mailboxId)
      .single();

    if (fetchError || !existingMailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    if (existingMailbox.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized to modify this mailbox" }, { status: 403 });
    }

    // Start warmup by setting is_active to true
    const { error: updateError } = await supabase
      .from("mailboxes")
      .update({ 
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", mailboxId);

    if (updateError) {
      console.error("Error starting warmup:", updateError);
      return NextResponse.json({ error: "Failed to start warmup" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Mailbox warmup started successfully"
    });

  } catch (error) {
    console.error("Error in warmup start:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 