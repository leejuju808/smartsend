import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const minScore = searchParams.get("min_score") || "70";
  const companyId = searchParams.get("company_id");

  try {
    let query = supabase
      .from("company_duplicates")
      .select(
        `
        *,
        company:companies!company_duplicates_company_id_fkey(id, name, domain, website),
        duplicate_company:companies!company_duplicates_duplicate_company_id_fkey(id, name, domain, website)
      `
      )
      .eq("workspace_id", workspaceId)
      .gte("score", parseInt(minScore))
      .is("reviewed_at", null)
      .order("score", { ascending: false });

    if (companyId) {
      query = query.or(`company_id.eq.${companyId},duplicate_company_id.eq.${companyId}`);
    }

    const { data: duplicates, error } = await query;

    if (error) {
      console.error("Error fetching duplicates:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ duplicates: duplicates || [] });
  } catch (error: any) {
    console.error("Error in duplicates fetch:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch duplicates" },
      { status: 500 }
    );
  }
}

// POST endpoint to trigger duplicate detection
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace" }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check if user is owner/admin
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can trigger duplicate detection" },
      { status: 403 }
    );
  }

  try {
    const { error } = await supabase.rpc("detect_company_duplicates", {
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error("Error detecting duplicates:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Duplicate detection completed",
    });
  } catch (error: any) {
    console.error("Error in duplicate detection:", error);
    return NextResponse.json(
      { error: error.message || "Failed to detect duplicates" },
      { status: 500 }
    );
  }
}








