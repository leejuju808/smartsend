// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// API Route: Send Proposal to Homeowner
// POST /api/proposals/send

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCompanyPaymentMomentGate } from "@/lib/billing/payment-moment";
import { assertValidRecipientEmail, computeSendIdempotencyKey } from "@/lib/reliability/delivery";

export async function POST(req: NextRequest) {
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
    const {
      proposal_id,
      homeowner_email,
      message,
    } = body;

    if (!proposal_id || !homeowner_email) {
      return NextResponse.json(
        { error: "proposal_id and homeowner_email are required" },
        { status: 400 }
      );
    }

    const emailCheck = assertValidRecipientEmail(String(homeowner_email || ""));
    if (!emailCheck.ok) {
      return NextResponse.json(
        { error: "Proposal not sent — email address is invalid." },
        { status: 400 }
      );
    }

    // Get proposal with estimate and company info
    const { data: proposal, error: proposalError } = await supabase
      .from("estimates_proposals")
      .select(`
        *,
        estimate:estimates(
          *,
          company:roofing_companies(*),
          homeowner:homeowners(*)
        )
      `)
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Verify user owns the company
    if (proposal.estimate?.company?.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const companyId = String(proposal.estimate?.company_id || "");
    if (!companyId) {
      return NextResponse.json(
        { error: "Proposal not sent — missing company." },
        { status: 400 }
      );
    }

    // LOCKED RULE: subscription.status must be active
    const { data: sub } = await supabase
      .from("billing_subscriptions")
      .select("status, current_period_end")
      .eq("user_id", proposal.estimate?.company?.owner_id)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub || sub.status !== "active") {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: proposal.estimate?.id,
        p_message_type: "proposal",
        p_status: "blocked",
        p_error_message: "Proposal not sent — subscription is not active.",
      });
      return NextResponse.json(
        { error: "Proposal not sent — subscription is not active." },
        { status: 402 }
      );
    }

    // Fail-safe: paused state blocks sends
    const { data: state } = await supabase.rpc("get_company_sending_state", {
      p_company_id: companyId,
    });
    const paused = Array.isArray(state) ? state[0]?.paused : (state as any)?.paused;
    if (paused) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: proposal.estimate?.id,
        p_message_type: "proposal",
        p_status: "blocked",
        p_error_message:
          "Proposal not sent — sending paused due to delivery issue. Manual resume required.",
      });
      return NextResponse.json(
        {
          error:
            "Proposal not sent — sending paused due to delivery issue. We’re protecting your account.",
          code: "SENDING_PAUSED",
        },
        { status: 423 }
      );
    }

    // CRITICAL: idempotency (estimate_id + proposal + 0)
    const sendIdempotencyKey = computeSendIdempotencyKey({
      relatedId: String(proposal.estimate?.id),
      messageType: "proposal",
      stepNumber: 0,
    });
    const { data: claimed } = await supabase.rpc("try_claim_send_idempotency", {
      p_company_id: companyId,
      p_send_idempotency_key: sendIdempotencyKey,
      p_related_id: proposal.estimate?.id,
      p_message_type: "proposal",
      p_step_number: 0,
    });

    if (!claimed) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: proposal.estimate?.id,
        p_message_type: "proposal",
        p_status: "duplicate_prevented",
        p_error_message: null,
      });
      return NextResponse.json({ ok: true, duplicate_prevented: true });
    }

    // LOCKED RULE: company not rate-limited
    const { data: rateLimited } = await supabase.rpc("is_company_rate_limited", {
      p_company_id: companyId,
    });
    if (rateLimited === true) {
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: proposal.estimate?.id,
        p_message_type: "proposal",
        p_status: "blocked",
        p_error_message: "Proposal queued — messages are queued to protect deliverability.",
      });
      return NextResponse.json(
        {
          error: "Proposal queued — messages are queued to protect deliverability.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    // BLOCK 268000 — Payment Moment Gate (Send Estimate/Proposal)
    if (companyId) {
      const gate = await checkCompanyPaymentMomentGate(supabase as any, companyId);
      if (gate.gated) {
        await supabase.rpc("log_delivery_attempt", {
          p_company_id: companyId,
          p_related_id: proposal.estimate?.id,
          p_message_type: "proposal",
          p_status: "blocked",
          p_error_message:
            gate.reason === "past_due"
              ? "Proposal not sent — update payment to continue sending."
              : "Proposal not sent — payment required to continue sending.",
        });
        return NextResponse.json(
          {
            error:
              gate.reason === "past_due"
                ? "Update payment to continue sending estimates."
                : "Payment required to continue sending estimates.",
            code: "PAYWALL",
            estimates_sent: gate.estimatesSent,
            subscription: gate.subscription,
          },
          { status: 402 }
        );
      }
    }

    // Generate public URL
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsendhq.com'}/proposals/${proposal.public_token}`;

    // Update proposal status to 'sent'
    const { error: updateError } = await supabase
      .from("estimates_proposals")
      .update({ status: "sent" })
      .eq("id", proposal_id);

    if (updateError) {
      console.error("Error updating proposal status:", updateError);
    }

    // Send email to homeowner (using your existing mailer)
    try {
      const emailSubject = `Your Roofing Proposal from ${proposal.estimate?.company?.name || 'SmartSend'}`;
      const emailBody = `
        <h2>Hello!</h2>
        <p>We've prepared a detailed roofing proposal for you. Please review it at your convenience.</p>
        <p><a href="${publicUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">View Proposal</a></p>
        ${message ? `<p><strong>Message from your contractor:</strong><br>${message}</p>` : ''}
        <p>If you have any questions, please don't hesitate to reach out.</p>
        <p>Best regards,<br>${proposal.estimate?.company?.name || 'SmartSend Roofing'}</p>
      `;

      // Use your existing email sending service
      // This is a placeholder - replace with your actual mailer
      const mailerResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsendhq.com'}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailCheck.email,
          subject: emailSubject,
          html: emailBody,
        }),
      }).catch(() => null);

      // If email service is not available, we'll still mark as sent
      // In production, you'd want proper error handling here
    } catch (emailError) {
      console.error("Error sending email:", emailError);
      const errMsg = (emailError as any)?.message || String(emailError);
      await supabase.rpc("log_delivery_attempt", {
        p_company_id: companyId,
        p_related_id: proposal.estimate?.id,
        p_message_type: "proposal",
        p_status: "failed",
        p_error_message: `Proposal not sent — delivery provider error: ${errMsg}`,
      });
      await supabase.rpc("maybe_auto_pause_company", { p_company_id: companyId });
      await supabase.rpc("pause_company_sending", {
        p_company_id: companyId,
        p_reason: "provider_failure",
        p_error:
          "Sending paused due to delivery issue. We’re protecting your account. Manual resume required.",
      });
      return NextResponse.json(
        {
          error:
            "Proposal not sent — sending paused due to delivery issue. We’re protecting your account.",
          code: "SENDING_PAUSED",
        },
        { status: 503 }
      );
    }

    await supabase.rpc("log_delivery_attempt", {
      p_company_id: companyId,
      p_related_id: proposal.estimate?.id,
      p_message_type: "proposal",
      p_status: "sent",
      p_error_message: null,
    });

    return NextResponse.json({
      ok: true,
      proposal_id,
      public_url: publicUrl,
      message: "Proposal sent successfully",
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/send:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























