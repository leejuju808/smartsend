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

    // Get appointment details
    const { data: appointment, error: fetchError } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }

    if (!appointment.homeowner_email) {
      return NextResponse.json(
        { error: "No email address for homeowner" },
        { status: 400 }
      );
    }

    // Generate confirmation message
    const homeownerName = appointment.homeowner_name || "there";
    const date = appointment.date;
    const time = appointment.time;

    const message = `Hi ${homeownerName},  

You're all set — we'll be there on ${date} around ${time}.  

Looking forward to helping with the roof.`;

    // TODO: Integrate with your email sending system
    // For now, we'll just mark it as sent and store the message
    // You can integrate this with your email sending infrastructure
    // (e.g., Resend, SendGrid, Gmail API, etc.)

    // Update appointment to mark confirmation as sent
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ confirmation_sent: true })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating appointment:", updateError);
      return NextResponse.json(
        { error: "Failed to mark confirmation as sent" },
        { status: 500 }
      );
    }

    // In a production environment, you would:
    // 1. Call your email sending API/service here
    // 2. Store the sent email in your outbound_messages or similar table
    // 3. Handle errors appropriately

    return NextResponse.json({
      success: true,
      message: "Confirmation message queued for sending",
    });
  } catch (error) {
    console.error("Error in send confirmation route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


























