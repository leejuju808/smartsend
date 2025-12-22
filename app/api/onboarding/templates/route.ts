// Block 21675 — Get Roofing Templates API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get roofing templates
  const { data: templates, error } = await supabase
    .from("campaign_templates")
    .select("id, name, description, goal")
    .eq("niche", "roofing")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }

  return NextResponse.json({ templates: templates || [] });
}














































