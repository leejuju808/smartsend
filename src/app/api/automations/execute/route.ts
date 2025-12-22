// Block 232000 — Automation Engine API
// POST /api/automations/execute - Execute an automation (internal use)
// This is called by event listeners across the platform

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeAutomation } from "@/lib/automation-engine";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const body = await req.json();
    const {
      automation_id,
      event_payload,
      entity_type,
      entity_id,
    } = body;

    if (!automation_id || !event_payload) {
      return NextResponse.json(
        { error: "Missing required fields: automation_id, event_payload" },
        { status: 400 }
      );
    }

    // Execute the automation
    const result = await executeAutomation({
      automationId: automation_id,
      eventPayload: event_payload,
      entityType: entity_type,
      entityId: entity_id,
      supabase,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to execute automation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      log_id: result.logId,
      action_results: result.actionResults,
    });
  } catch (error: any) {
    console.error("[Automations] Execute error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























