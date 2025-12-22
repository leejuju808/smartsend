import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from user context (assuming it's in JWT or we need to query)
    // For now, we'll query all snippets accessible to the user
    // In production, you'd get workspace_id from JWT or user's workspace membership
    
    const { data: snippets, error } = await supabase
      .from("snippets")
      .select("id, title, body, category, created_at, updated_at")
      .order("category", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      console.error("Error fetching snippets:", error);
      return NextResponse.json(
        { error: "Failed to fetch snippets" },
        { status: 500 }
      );
    }

    return NextResponse.json({ snippets: snippets || [] });
  } catch (error) {
    console.error("[List Snippets] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list snippets" },
      { status: 500 }
    );
  }
}









