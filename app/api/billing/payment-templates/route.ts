import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/billing/payment-templates
 * Get payment templates (global and workspace-specific)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();

    // Get global templates (workspace_id is NULL) and workspace-specific templates
    let query = supabase
      .from("payment_templates")
      .select("*")
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    const { data: templates, error } = await query;

    if (error) {
      console.error("Error fetching payment templates:", error);
      return NextResponse.json(
        { error: "Failed to fetch payment templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    console.error("Error in GET /api/billing/payment-templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/billing/payment-templates
 * Create a custom payment template
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description, schedule, is_default = false } = body;

    if (!name || !schedule || !Array.isArray(schedule)) {
      return NextResponse.json(
        { error: "Name and schedule array are required" },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults for this workspace
    if (is_default) {
      await supabase
        .from("payment_templates")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId)
        .eq("is_default", true);
    }

    const { data: template, error } = await supabase
      .from("payment_templates")
      .insert({
        workspace_id: workspaceId,
        name,
        description: description || null,
        schedule,
        is_default,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating payment template:", error);
      return NextResponse.json(
        { error: "Failed to create payment template", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error("Error in POST /api/billing/payment-templates:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}






















