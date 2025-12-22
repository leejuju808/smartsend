// Block 220000 — SmartSend Roofing Proposal Follow-up Automation
// API Route: Send 48-hour follow-up emails for pending proposals
// POST /api/automations/proposal-followup
// This should be called by a cron job daily

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get pending proposals that are 48+ hours old and haven't been followed up
    const { data: proposals, error } = await supabase.rpc(
      "check_pending_proposals_48h"
    );

    if (error) {
      console.error("Error checking pending proposals:", error);
      return NextResponse.json(
        { error: "Failed to check proposals", details: error.message },
        { status: 500 }
      );
    }

    if (!proposals || proposals.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No proposals need follow-up",
        sent: 0,
      });
    }

    let sentCount = 0;

    // Send follow-up emails
    for (const proposal of proposals) {
      try {
        // Generate AI follow-up message
        const followupMessage = `Hey! Just checking in on your roofing proposal. We're here to answer any questions you might have. Review your proposal here: ${proposal.proposal_url}`;

        // Send email (using your existing mailer)
        const emailResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsendhq.com'}/api/send-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: proposal.homeowner_email,
              subject: `Following up on your roofing proposal from ${proposal.company_name}`,
              html: `
                <h2>Hi there!</h2>
                <p>Just checking in on your roofing proposal. We're here to answer any questions you might have.</p>
                <p><a href="${proposal.proposal_url}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">Review Proposal</a></p>
                <p>Best regards,<br>${proposal.company_name}</p>
              `,
            }),
          }
        ).catch(() => null);

        // Record follow-up
        await supabase.from("proposal_followups").insert({
          proposal_id: proposal.proposal_id,
          followup_type: "48h_pending",
        });

        sentCount++;
      } catch (emailError) {
        console.error(`Error sending follow-up for proposal ${proposal.proposal_id}:`, emailError);
        // Continue with other proposals
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Sent ${sentCount} follow-up emails`,
      sent: sentCount,
      total: proposals.length,
    });
  } catch (error: any) {
    console.error("Error in /api/automations/proposal-followup:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























