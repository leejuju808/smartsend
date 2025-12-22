// Block 228000 — Get Insurance Supplements for Job
// GET /api/jobs/[jobId]/supplements

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get supplements with items
    const { data: supplements, error } = await supabase
      .from("insurance_supplements")
      .select(`
        *,
        supplement_items (*)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching supplements:", error);
      return NextResponse.json(
        { error: "Failed to fetch supplements" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      supplements: supplements || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/jobs/[jobId]/supplements:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























