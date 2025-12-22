// Block 49000 — SmartSend Roofing Safety Compliance v1
// API Route: Get Safety Templates
// GET /api/safety/templates?template_type=pre_start_checklist
// Returns OSHA templates and workspace custom templates

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const template_type = searchParams.get("template_type");

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    let query = supabase
      .from("safety_templates")
      .select("*")
      .eq("is_active", true)
      .or("is_default.eq.true,workspace_id.eq." + (workspaceMember?.workspace_id || "00000000-0000-0000-0000-000000000000"))
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (template_type) {
      query = query.eq("template_type", template_type);
    }

    const { data: templates, error: templatesError } = await query;

    if (templatesError) {
      console.error("Error fetching safety templates:", templatesError);
      return NextResponse.json(
        { error: "Failed to fetch safety templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      templates: templates || [],
    });
  } catch (error: any) {
    console.error("Error in safety templates API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































