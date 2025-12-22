import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

// GET /api/roofing-snippets - List all roofing snippets, optionally filtered by category
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    let query = supabase.from("roofing_snippets").select("*").order("category", { ascending: true });

    if (category) {
      query = query.eq("category", category);
    }

    const { data: snippets, error } = await query;

    if (error) {
      console.error("Error fetching roofing snippets:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ snippets: snippets || [] });
  } catch (error: any) {
    console.error("Error in GET /api/roofing-snippets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























































