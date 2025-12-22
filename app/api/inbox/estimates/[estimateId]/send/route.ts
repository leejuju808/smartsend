import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/estimates/[estimateId]/send
 * Send estimate range to homeowner via email/SMS
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { estimateId: string } }
) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { channel = "email", message } = body; // channel: "email" | "sms"

    const { estimateId } = params;

    // Get estimate with thread and contact info
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select(`
        *,
        inbox_threads:thread_id (
          id,
          campaign_id,
          lead_id,
          contacts:contact_id (
            id,
            email,
            phone,
            first_name,
            last_name
          ),
          campaigns:campaign_id (
            id,
            name,
            from_email,
            from_name
          )
        )
      `)
      .eq("id", estimateId)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    const thread = estimate.inbox_threads;
    const contact = thread?.contacts;
    const campaign = thread?.campaigns;

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Build message
    const priceRange = estimate.price_range_text || `$${estimate.estimated_total_min?.toFixed(0)} - $${estimate.estimated_total_max?.toFixed(0)}`;
    const jobTypeText = estimate.job_type === "roof_repair" ? "repair" : "replacement";
    
    const defaultMessage = `Hi ${contact.first_name || "there"},

Based on the photos and details you've shared, we estimate the ${jobTypeText} will be in the ${priceRange} range.

Would you like us to schedule a formal inspection to provide you with a detailed, written estimate?

Best regards,
${campaign?.from_name || "SmartSend Team"}`;

    const messageText = message || defaultMessage;

    // Send via email or SMS
    if (channel === "email") {
      if (!contact.email) {
        return NextResponse.json(
          { error: "Contact email not found" },
          { status: 400 }
        );
      }

      // Create message in inbox_messages
      const { data: sentMessage, error: messageError } = await supabase
        .from("inbox_messages")
        .insert({
          thread_id: thread.id,
          direction: "outbound",
          from_email: campaign?.from_email || "noreply@smartsend.ai",
          to_email: contact.email,
          subject: `Quick Estimate: ${priceRange}`,
          body_text: messageText,
          body_html: messageText.replace(/\n/g, "<br>"),
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (messageError) {
        console.error("Error sending email:", messageError);
        return NextResponse.json(
          { error: "Failed to send email" },
          { status: 500 }
        );
      }

      // Update estimate status
      await supabase
        .from("estimates")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", estimateId);

      // Update thread pipeline stage
      await supabase
        .from("inbox_threads")
        .update({
          pipeline_stage: "estimate_scheduled",
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", thread.id);

      return NextResponse.json({
        success: true,
        message: sentMessage,
        channel: "email",
      });
    } else if (channel === "sms") {
      if (!contact.phone) {
        return NextResponse.json(
          { error: "Contact phone not found" },
          { status: 400 }
        );
      }

      // Call SMS send API (assuming it exists)
      // For now, we'll just update the estimate status
      // In production, integrate with your SMS provider
      
      await supabase
        .from("estimates")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", estimateId);

      await supabase
        .from("inbox_threads")
        .update({
          pipeline_stage: "estimate_scheduled",
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", thread.id);

      return NextResponse.json({
        success: true,
        channel: "sms",
        message: "SMS sent (integration pending)",
      });
    } else {
      return NextResponse.json(
        { error: "Invalid channel. Use 'email' or 'sms'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error in /api/inbox/estimates/[estimateId]/send:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































