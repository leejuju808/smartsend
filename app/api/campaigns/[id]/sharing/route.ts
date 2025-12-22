import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const campaignId = params.id;

    const { is_shared }: { is_shared: boolean } = await req.json();

    if (typeof is_shared !== "boolean") {
      return NextResponse.json(
        { error: "is_shared (boolean) is required" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Update campaign sharing flag
    // RLS already ensures:
    // - user is in workspace
    // - user can update this campaign (owner or shared)
    const { data, error } = await supabase
      .from("campaigns")
      .update({ is_shared })
      .eq("id", campaignId)
      .select("id, name, is_shared, created_by")
      .single();

    if (error) {
      console.error("Update campaign sharing error:", error);
      return NextResponse.json(
        { error: "Failed to update campaign sharing" },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Campaign sharing error:", err);
    return NextResponse.json(
      { error: "Unexpected error updating campaign sharing" },
      { status: 500 }
    );
  }
}


