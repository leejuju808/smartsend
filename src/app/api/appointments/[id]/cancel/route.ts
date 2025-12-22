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

    // Update appointment status to cancelled
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error cancelling appointment:", error);
      return NextResponse.json(
        { error: "Failed to cancel appointment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, appointment: data });
  } catch (error) {
    console.error("Error in cancel appointment route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


























