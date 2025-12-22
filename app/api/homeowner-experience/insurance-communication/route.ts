// Block 25140 — SmartSend Roofing Homeowner Experience v1
// API endpoint for sending insurance-related homeowner communications

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { sendInsuranceCommunication } from "@/lib/homeowner-experience/automation";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspaceId,
      jobId,
      contactId,
      communicationType,
      metadata,
      channel,
    } = body;

    // Validate required fields
    if (!workspaceId || !jobId || !contactId || !communicationType) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: workspaceId, jobId, contactId, communicationType",
        },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: owner } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!member && !owner) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Send insurance communication
    const result = await sendInsuranceCommunication({
      workspaceId,
      jobId,
      contactId,
      communicationType,
      metadata,
      channel,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send communication" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error sending insurance communication:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

