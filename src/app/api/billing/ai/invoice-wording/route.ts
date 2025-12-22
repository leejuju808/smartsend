// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/ai/invoice-wording
// AI suggests invoice wording to improve payment rates

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoice_type, amount, homeowner_name, job_description } = body;

    // AI-powered invoice wording suggestions
    // This would typically use an LLM API (OpenAI, Anthropic, etc.)
    // For now, we'll provide template-based suggestions

    const suggestions = {
      subject_line: "",
      body_text: "",
      call_to_action: "",
      payment_urgency: "",
    };

    if (invoice_type === "deposit") {
      suggestions.subject_line = `Deposit Invoice - ${homeowner_name || "Your"} Roofing Project`;
      suggestions.body_text = `Hi ${homeowner_name || "there"},

Thank you for choosing us for your roofing project! We're excited to get started.

To secure your project date and begin material ordering, please submit your deposit of ${amount ? `$${Number(amount).toLocaleString()}` : "the amount shown"}.

Your deposit ensures:
✓ Priority scheduling
✓ Material ordering begins immediately
✓ Project timeline is secured

You can pay securely online using the link below.`;

      suggestions.call_to_action = "Pay Deposit Now";
      suggestions.payment_urgency = "To secure your project date, please pay within 48 hours.";
    } else if (invoice_type === "progress") {
      suggestions.subject_line = `Progress Payment - ${homeowner_name || "Your"} Roofing Project`;
      suggestions.body_text = `Hi ${homeowner_name || "there"},

Great progress on your roofing project! ${job_description || "Work is proceeding as planned"}.

Your progress payment of ${amount ? `$${Number(amount).toLocaleString()}` : "the amount shown"} is now due.

This payment covers:
✓ Materials delivered
✓ Work completed to date
✓ Crew time and expertise

Thank you for your continued partnership!`;

      suggestions.call_to_action = "Pay Progress Payment";
      suggestions.payment_urgency = "Please pay within 7 days to keep the project on schedule.";
    } else if (invoice_type === "final") {
      suggestions.subject_line = `Final Invoice - ${homeowner_name || "Your"} Roofing Project Complete`;
      suggestions.body_text = `Hi ${homeowner_name || "there"},

Congratulations! Your roofing project is complete and looks amazing!

Your final payment of ${amount ? `$${Number(amount).toLocaleString()}` : "the amount shown"} is now due.

Final payment includes:
✓ All completed work
✓ Final inspection
✓ Warranty documentation
✓ Project closeout

We appreciate your business and look forward to serving you in the future!`;

      suggestions.call_to_action = "Pay Final Invoice";
      suggestions.payment_urgency = "Final payment is due upon completion. Please pay within 7 days.";
    }

    // Add AI-powered optimization tips
    const optimizationTips = [
      "Use the homeowner's name for personalization",
      "Include specific project details to build trust",
      "Highlight value delivered, not just amount due",
      "Make payment easy with clear call-to-action",
      "Set clear expectations with due date",
    ];

    return NextResponse.json({
      success: true,
      suggestions,
      optimization_tips: optimizationTips,
      ai_confidence: 0.85, // Simulated AI confidence score
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/ai/invoice-wording:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























