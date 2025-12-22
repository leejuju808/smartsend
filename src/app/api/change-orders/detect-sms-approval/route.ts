// Block 37990 — Detect Change Order Approval from SMS
// POST /api/change-orders/detect-sms-approval
// Called from SMS webhook to detect YES replies for change order approvals

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizePhoneNumber } from "@/lib/providers/sms";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Detect if SMS message is a YES approval for change order
 */
function isApprovalMessage(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  
  // Exact matches
  if (normalized === "yes" || normalized === "y" || normalized === "approve") {
    return true;
  }
  
  // Common approval phrases
  const approvalPatterns = [
    /^yes\s*$/i,
    /^y\s*$/i,
    /^approve\s*$/i,
    /^ok\s*$/i,
    /^sure\s*$/i,
    /^go ahead\s*$/i,
    /^that works\s*$/i,
    /^sounds good\s*$/i,
    /^approved\s*$/i,
    /^i approve\s*$/i,
  ];
  
  return approvalPatterns.some(pattern => pattern.test(normalized));
}

export async function POST(req: NextRequest) {
  try {
    const { from, body, to } = await req.json();

    if (!from || !body) {
      return NextResponse.json(
        { error: "from and body are required" },
        { status: 400 }
      );
    }

    // Check if this is an approval message
    if (!isApprovalMessage(body)) {
      return NextResponse.json({
        ok: false,
        is_approval: false,
        message: "Not an approval message",
      });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(from);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Find lead by phone number
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, phone")
      .or(`phone.eq.${normalizedPhone},phone.eq.${from}`)
      .maybeSingle();

    if (leadError || !lead) {
      return NextResponse.json({
        ok: false,
        is_approval: true,
        message: "Lead not found for this phone number",
      });
    }

    // Find most recent pending change order for this lead
    const { data: pendingCO, error: findError } = await supabase
      .from("change_orders")
      .select(`
        id,
        job_id,
        amount,
        status,
        description,
        jobs!inner (
          id,
          lead_id
        )
      `)
      .eq("status", "pending")
      .eq("jobs.lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError || !pendingCO) {
      return NextResponse.json({
        ok: false,
        is_approval: true,
        message: "No pending change order found for this lead",
      });
    }

    // Approve the change order
    const { error: updateError } = await supabase
      .from("change_orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", pendingCO.id);

    if (updateError) {
      console.error("Error approving change order:", updateError);
      return NextResponse.json(
        { error: "Failed to approve change order" },
        { status: 500 }
      );
    }

    // Send confirmation SMS
    const confirmationMessage = `Thank you! Change order approved for $${pendingCO.amount.toFixed(2)}. Your contract has been updated.`;
    
    // Get SMS provider config
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
      const { sendSMS } = await import("@/lib/providers/sms");
      await sendSMS(normalizedPhone, confirmationMessage, {
        provider: "twilio",
        credentials: {
          accountSid: twilioAccountSid,
          authToken: twilioAuthToken,
          phoneNumber: twilioPhoneNumber,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      is_approval: true,
      change_order_id: pendingCO.id,
      approved: true,
      message: "Change order approved successfully",
    });
  } catch (error: any) {
    console.error("Error detecting SMS approval:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process approval" },
      { status: 500 }
    );
  }
}
































