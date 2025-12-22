// POST /api/materials/approval - Approve or reject material verification

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, status, notes } = body;

    if (!job_id || !status) {
      return NextResponse.json(
        { error: "job_id and status are required" },
        { status: 400 }
      );
    }

    // Check if approval already exists
    const { data: existing } = await supabase
      .from("material_verification_approval")
      .select("id")
      .eq("job_id", job_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("material_verification_approval")
        .update({
          status,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("material_verification_approval")
        .insert({
          job_id,
          status,
          approved_by: user.id,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ approval: result }, { status: existing ? 200 : 201 });
  } catch (error: any) {
    console.error("Error in POST /api/materials/approval:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























