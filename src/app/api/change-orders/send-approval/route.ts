// Block 37990 — Send Change Order Approval Request
// POST /api/change-orders/send-approval
// Sends SMS/email to homeowner requesting approval for change order

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { change_order_id } = await req.json();

    if (!change_order_id) {
      return NextResponse.json(
        { error: "change_order_id is required" },
        { status: 400 }
      );
    }

    // Get change order with job and lead info
    const { data: changeOrder, error: coError } = await supabase
      .from("change_orders")
      .select(`
        id,
        job_id,
        description,
        amount,
        status,
        jobs (
          id,
          lead_id,
          leads (
            id,
            first_name,
            last_name,
            phone,
            email
          )
        )
      `)
      .eq("id", change_order_id)
      .single();

    if (coError || !changeOrder) {
      return NextResponse.json(
        { error: "Change order not found" },
        { status: 404 }
      );
    }

    if (changeOrder.status !== "pending") {
      return NextResponse.json(
        { error: "Change order is not pending approval" },
        { status: 400 }
      );
    }

    const lead = (changeOrder.jobs as any)?.leads;
    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found for this job" },
        { status: 404 }
      );
    }

    const leadName = lead.first_name || "there";
    const phone = lead.phone;
    const email = lead.email;

    if (!phone && !email) {
      return NextResponse.json(
        { error: "Lead has no phone or email" },
        { status: 400 }
      );
    }

    // Format message
    const message = `Hi ${leadName}, during installation we discovered: ${changeOrder.description}

The additional work cost is $${changeOrder.amount.toFixed(2)}.

Reply YES to approve.`;

    let smsSent = false;
    let emailSent = false;

    // Send SMS if phone available
    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);
      if (normalizedPhone) {
        // Get SMS provider config from environment or workspace settings
        // For now, use environment variables
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

        if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
          const smsResult = await sendSMS(normalizedPhone, message, {
            provider: "twilio",
            credentials: {
              accountSid: twilioAccountSid,
              authToken: twilioAuthToken,
              phoneNumber: twilioPhoneNumber,
            },
          });

          smsSent = smsResult.success;
          if (!smsSent) {
            console.error("Failed to send SMS:", smsResult.error);
          }
        }
      }
    }

    // Send email if email available (and SMS failed or not available)
    if (email && !smsSent) {
      // TODO: Implement email sending for change order approvals
      // For now, we'll just log it
      console.log("Email sending not yet implemented for change orders");
    }

    // Update change order to mark that approval was sent
    await supabase
      .from("change_orders")
      .update({
        details: {
          ...(changeOrder.details as any || {}),
          approval_sent_at: new Date().toISOString(),
          approval_sent_via: smsSent ? "sms" : emailSent ? "email" : "none",
        },
      })
      .eq("id", change_order_id);

    return NextResponse.json({
      ok: true,
      sms_sent: smsSent,
      email_sent: emailSent,
    });
  } catch (error: any) {
    console.error("Error sending approval request:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send approval request" },
      { status: 500 }
    );
  }
}
































