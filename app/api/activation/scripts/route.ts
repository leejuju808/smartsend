import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/activation/scripts
 * 
 * Retrieve activation scripts for onboarding calls
 * 
 * Query params:
 * - type: Filter by script type (call_part, followup_script, checklist, red_flag, psychology_insight)
 * - key: Get specific script by key
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const scriptType = searchParams.get("type");
    const scriptKey = searchParams.get("key");

    let query = supabase
      .from("activation_scripts")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    // Filter by type if provided
    if (scriptType) {
      query = query.eq("script_type", scriptType);
    }

    // Get specific script by key if provided
    if (scriptKey) {
      query = query.eq("script_key", scriptKey).single();
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching activation scripts:", error);
      return NextResponse.json(
        { error: "Failed to fetch activation scripts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ scripts: data });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/activation/scripts
 * 
 * Create or update an activation script (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add admin check here
    // For now, allow authenticated users

    const body = await req.json();
    const {
      script_type,
      script_key,
      title,
      script_content,
      why_it_helps,
      display_order,
      is_active = true,
    } = body;

    if (!script_type || !script_key || !title || !script_content) {
      return NextResponse.json(
        { error: "Missing required fields: script_type, script_key, title, script_content" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("activation_scripts")
      .upsert(
        {
          script_type,
          script_key,
          title,
          script_content,
          why_it_helps,
          display_order: display_order ?? 0,
          is_active,
        },
        {
          onConflict: "script_key",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting activation script:", error);
      return NextResponse.json(
        { error: "Failed to save activation script" },
        { status: 500 }
      );
    }

    return NextResponse.json({ script: data });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






































