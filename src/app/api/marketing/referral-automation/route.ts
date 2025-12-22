/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Referral Automation API
 * 
 * GET /api/marketing/referral-automation - List referral automation configs
 * POST /api/marketing/referral-automation - Create referral automation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Get referral automation configs
    const { data: automations, error } = await supabase
      .from("referral_automation")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching referral automation:", error);
      return NextResponse.json({ error: "Failed to fetch automation configs" }, { status: 500 });
    }

    return NextResponse.json({ automations });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/referral-automation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      trigger_type,
      trigger_delay_days,
      subject_template,
      body_template,
      incentive_type,
      incentive_value,
      incentive_description,
      is_active,
    } = body;

    // Validation
    if (!workspace_id || !trigger_type || !subject_template || !body_template) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, trigger_type, subject_template, body_template" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Create referral automation
    const { data: automation, error } = await supabase
      .from("referral_automation")
      .insert({
        workspace_id,
        trigger_type,
        trigger_delay_days: trigger_delay_days || 0,
        subject_template,
        body_template,
        incentive_type: incentive_type || null,
        incentive_value: incentive_value || null,
        incentive_description: incentive_description || null,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating referral automation:", error);
      return NextResponse.json({ error: "Failed to create automation" }, { status: 500 });
    }

    return NextResponse.json({ automation }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/referral-automation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































