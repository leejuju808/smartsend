// PUT /api/workforce/qc/punch-list/[id] - Update punch list item
// DELETE /api/workforce/qc/punch-list/[id] - Delete punch list item

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // If status is being set to completed, set completed_at
    const updateData: any = { ...body };
    if (body.status === "completed" && !body.completed_at) {
      updateData.completed_at = new Date().toISOString();
    } else if (body.status !== "completed") {
      updateData.completed_at = null;
    }

    const { data, error } = await supabase
      .from("qc_punch_list")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating punch list item:", error);
      return NextResponse.json(
        { error: "Failed to update punch list item" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Punch list item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("Error in punch list PUT:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabase
      .from("qc_punch_list")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting punch list item:", error);
      return NextResponse.json(
        { error: "Failed to delete punch list item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in punch list DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























