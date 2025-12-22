import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(
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

    // Get appointment details
    const { data: appointment, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }

    // Generate confirmation message
    const homeownerName = appointment.homeowner_name || "there";
    const date = appointment.date;
    const time = appointment.time;

    const message = `Hi ${homeownerName},  

You're all set — we'll be there on ${date} around ${time}.  

Looking forward to helping with the roof.`;

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Error in get confirmation route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


























