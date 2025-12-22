import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

// GET /api/leads/duplicates - List duplicate leads
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = createClient();
    const url = new URL(req.url);
    const min_score = url.searchParams.get("min_score") || "70";
    const reviewed = url.searchParams.get("reviewed"); // 'true', 'false', or undefined for all

    let query = supabase
      .from("lead_duplicates")
      .select(
        `
        id,
        lead_id,
        duplicate_lead_id,
        score,
        match_type,
        created_at,
        reviewed_at,
        lead:leads!lead_duplicates_lead_id_fkey (
          id,
          email,
          first_name,
          last_name,
          company,
          title,
          phone,
          linkedin_url,
          owner_id,
          score,
          created_at,
          last_activity_at
        ),
        duplicate_lead:leads!lead_duplicates_duplicate_lead_id_fkey (
          id,
          email,
          first_name,
          last_name,
          company,
          title,
          phone,
          linkedin_url,
          owner_id,
          score,
          created_at,
          last_activity_at
        )
      `
      )
      .eq("workspace_id", workspace_id)
      .gte("score", parseInt(min_score))
      .order("score", { ascending: false });

    if (reviewed === "true") {
      query = query.not("reviewed_at", "is", null);
    } else if (reviewed === "false") {
      query = query.is("reviewed_at", null);
    }

    const { data: duplicates, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch duplicates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ duplicates: duplicates || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/leads/duplicates/detect - Trigger duplicate detection
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id, user } = gate;
    const supabase = createClient();

    // Verify user has admin/owner role
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can trigger duplicate detection" },
        { status: 403 }
      );
    }

    // Call duplicate detection function
    const { error: detectError } = await supabase.rpc("detect_lead_duplicates", {
      p_workspace_id: workspace_id,
    });

    if (detectError) {
      return NextResponse.json(
        { error: detectError.message || "Failed to detect duplicates" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Duplicate detection completed",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
