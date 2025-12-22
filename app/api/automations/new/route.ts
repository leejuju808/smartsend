import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { name, trigger, condition, delay_hours, actions } = await req.json();

    // Validate required fields
    if (!name || !trigger || !actions || !Array.isArray(actions)) {
      return NextResponse.json(
        { error: "Missing required fields: name, trigger, and actions" },
        { status: 400 }
      );
    }

    // Get workspace_id from cookie or session
    const cookieStore = await cookies();
    const workspaceId =
      cookieStore.get("active_ws")?.value ||
      cookieStore.get("active_wid")?.value ||
      cookieStore.get("ws")?.value;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No active workspace found" },
        { status: 400 }
      );
    }

    // Validate delay_hours for no_reply trigger
    if (trigger === "no_reply" && (!delay_hours || delay_hours <= 0)) {
      return NextResponse.json(
        { error: "delay_hours is required for no_reply trigger" },
        { status: 400 }
      );
    }

    // Create the automation
    const { data: automation, error } = await supabase
      .from("automations")
      .insert({
        workspace_id: workspaceId,
        name,
        trigger,
        condition: condition || {},
        delay_hours: trigger === "no_reply" ? delay_hours : 0,
        actions,
        enabled: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating automation:", error);
      return NextResponse.json(
        { error: "Failed to create automation", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      automation,
      message: "Automation created successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/automations/new:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

