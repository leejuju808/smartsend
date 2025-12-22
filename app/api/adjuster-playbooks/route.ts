import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

// GET /api/adjuster-playbooks
// Returns all available adjuster communication playbooks
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();

    const { data: playbooks, error } = await supabase
      .from("roofing_adjuster_playbooks")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching playbooks:", error);
      return NextResponse.json(
        { error: "Failed to fetch playbooks" },
        { status: 500 }
      );
    }

    return NextResponse.json({ playbooks: playbooks || [] });
  } catch (error: any) {
    console.error("Error in adjuster-playbooks route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































