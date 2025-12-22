import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/generate-message
 * Generate AI message for a lead using SmartSend's intelligence
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lead_id, message_type } = await req.json();

    if (!lead_id || !message_type) {
      return NextResponse.json(
        { error: "Missing required parameters: lead_id and message_type" },
        { status: 400 }
      );
    }

    // Verify user has access to this lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Check workspace access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", lead.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Invoke the generate-message edge function
    const { data, error } = await supabase.functions.invoke("generate-message", {
      body: {
        lead_id,
        message_type,
      },
    });

    if (error) {
      console.error("Error invoking generate-message:", error);
      return NextResponse.json(
        { error: error.message || "Failed to generate message" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/generate-message:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

