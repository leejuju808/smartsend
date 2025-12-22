/**
 * Integration Management API
 * 
 * CRUD operations for roofing integrations
 * Supports all 5 categories of integrations
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// GET - List all integrations for a workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const category = searchParams.get("category"); // Optional filter by category

    if (!workspace_id) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    let query = supabase
      .from("integrations")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false });

    // Filter by category if provided
    if (category) {
      const categoryTypes: Record<string, string[]> = {
        communication: ["gmail", "outlook", "sms_twilio", "sms_telnyx", "webform_gravity", "webform_jotform", "webform_wix", "webform_gohighlevel"],
        crm: ["crm_jobnimbus", "crm_acculynx", "crm_roofr", "crm_gohighlevel"],
        calendar: ["calendar_google", "calendar_outlook", "booking_calendly", "booking_savvycal", "booking_youcanbookme"],
        import: ["import_csv", "import_quickbooks", "import_phone_contacts"],
        weather: ["weather_noaa", "weather_hailtrace", "weather_hail_recon"]
      };

      const types = categoryTypes[category] || [];
      if (types.length > 0) {
        query = query.in("type", types);
      }
    }

    const { data: integrations, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ integrations });

  } catch (error) {
    console.error("Error fetching integrations:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new integration
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      type,
      config,
      phase = 1,
      enabled = true
    } = body;

    if (!workspace_id || !type || !config) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, type, config" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Validate integration type
    const validTypes = [
      // Communication
      "gmail", "outlook", "sms_twilio", "sms_telnyx",
      "webform_gravity", "webform_jotform", "webform_wix", "webform_gohighlevel",
      // CRM
      "crm_jobnimbus", "crm_acculynx", "crm_roofr", "crm_gohighlevel",
      // Calendar
      "calendar_google", "calendar_outlook",
      "booking_calendly", "booking_savvycal", "booking_youcanbookme",
      // Import
      "import_csv", "import_quickbooks", "import_phone_contacts",
      // Weather
      "weather_noaa", "weather_hailtrace", "weather_hail_recon",
      // Existing
      "zapier", "slack", "hubspot"
    ];

    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid integration type" }, { status: 400 });
    }

    // Create integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .insert({
        workspace_id,
        type,
        config,
        phase,
        enabled
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Create category-specific records if needed
    if (type.startsWith("crm_")) {
      await supabase
        .from("crm_sync_status")
        .insert({
          integration_id: integration.id,
          workspace_id,
          sync_direction: "bidirectional",
          auto_sync_enabled: true
        });
    } else if (type.startsWith("calendar_") || type.startsWith("booking_")) {
      await supabase
        .from("calendar_integrations")
        .insert({
          integration_id: integration.id,
          workspace_id,
          booking_enabled: true,
          auto_confirm_enabled: false
        });
    }

    return NextResponse.json({ integration });

  } catch (error) {
    console.error("Error creating integration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update integration
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { integration_id, config, enabled, phase } = body;

    if (!integration_id) {
      return NextResponse.json({ error: "integration_id is required" }, { status: 400 });
    }

    // Verify integration belongs to user's workspace
    const { data: integration } = await supabase
      .from("integrations")
      .select("workspace_id")
      .eq("id", integration_id)
      .single();

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", integration.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Update integration
    const updateData: any = {};
    if (config !== undefined) updateData.config = config;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (phase !== undefined) updateData.phase = phase;

    const { data: updatedIntegration, error } = await supabase
      .from("integrations")
      .update(updateData)
      .eq("id", integration_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ integration: updatedIntegration });

  } catch (error) {
    console.error("Error updating integration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove integration
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const integration_id = searchParams.get("integration_id");

    if (!integration_id) {
      return NextResponse.json({ error: "integration_id is required" }, { status: 400 });
    }

    // Verify integration belongs to user's workspace
    const { data: integration } = await supabase
      .from("integrations")
      .select("workspace_id")
      .eq("id", integration_id)
      .single();

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", integration.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Delete integration (cascade will handle related records)
    const { error } = await supabase
      .from("integrations")
      .delete()
      .eq("id", integration_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error deleting integration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}






































