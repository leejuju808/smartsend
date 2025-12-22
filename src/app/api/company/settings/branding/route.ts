import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

// Helper to check if user has write access (owner/admin)
async function checkWriteAccess(
  supabase: any,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return workspaceMember && (workspaceMember.role === "owner" || workspaceMember.role === "admin");
}

// GET /api/company/settings/branding - Get branding settings
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("company_branding")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || {
      logo_url: null,
      brand_primary_color: "#1E40AF",
      brand_accent_color: "#3B82F6",
      button_color: "#2563EB",
    });
  } catch (error: any) {
    console.error("Error fetching branding:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/company/settings/branding - Update branding settings
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace_id = await getCurrentWorkspaceId();
    if (!workspace_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Check write access
    const hasAccess = await checkWriteAccess(supabase, workspace_id, user.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Only Owners/Admins can edit branding" }, { status: 403 });
    }

    const body = await req.json();
    const { logo_url, brand_primary_color, brand_accent_color, button_color } = body;

    const { data, error } = await supabase
      .from("company_branding")
      .upsert(
        {
          workspace_id,
          logo_url,
          brand_primary_color,
          brand_accent_color,
          button_color,
        },
        {
          onConflict: "workspace_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating branding:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error updating branding:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































