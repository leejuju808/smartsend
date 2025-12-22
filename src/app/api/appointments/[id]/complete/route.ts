import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Update appointment status to completed
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error completing appointment:", error);
      return NextResponse.json(
        { error: "Failed to complete appointment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, appointment: data });
  } catch (error) {
    console.error("Error in complete appointment route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


























