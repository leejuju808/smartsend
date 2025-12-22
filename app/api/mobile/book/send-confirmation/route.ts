import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/book/send-confirmation
 * Send SMS confirmation for booked appointment
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const { booking_id, phone, date, time, address } = await req.json();

    if (!phone || !date || !time) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Format date/time
    const dateObj = new Date(`${date}T${time}`);
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = dateObj.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    // Send SMS confirmation
    const message = `Hi! Your roof inspection is confirmed for ${formattedDate} at ${formattedTime}. Address: ${address}. We'll see you then! - SmartSend`;

    const { error: smsError } = await supabase.rpc("send_sms", {
      p_workspace_id: workspace_id,
      p_to_phone: phone,
      p_body: message,
    });

    if (smsError) {
      // Fallback to API route
      await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phone,
          body: message,
        }),
      });
    }

    // Update booking confirmation status
    if (booking_id) {
      await supabase
        .from("schedule_bookings")
        .update({ confirmation_sent: true })
        .eq("id", booking_id);
    }

    return NextResponse.json({ ok: true, message: "Confirmation sent" });
  } catch (error: any) {
    console.error("Error sending confirmation:", error);
    return NextResponse.json(
      { error: "Failed to send confirmation" },
      { status: 500 }
    );
  }
}






































