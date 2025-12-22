// Block 25140 — SmartSend Roofing Homeowner Experience v1
// API endpoint for sending homeowner confirmation messages

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  sendHomeownerConfirmation,
  HomeownerConfirmationOptions,
} from "@/lib/homeowner-experience/automation";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: HomeownerConfirmationOptions = await req.json();
    const {
      workspaceId,
      jobId,
      leadId,
      contactId,
      confirmationType,
      metadata,
      channel,
    } = body;

    // Validate required fields
    if (!workspaceId || !contactId || !confirmationType) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, contactId, confirmationType" },
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
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Send confirmation
    const result = await sendHomeownerConfirmation({
      workspaceId,
      jobId,
      leadId,
      contactId,
      confirmationType,
      metadata,
      channel,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send confirmation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      confirmationId: result.confirmationId,
    });
  } catch (error: any) {
    console.error("Error sending homeowner confirmation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

