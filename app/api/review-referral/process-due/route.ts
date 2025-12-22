import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/sendEmail";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/review-referral/process-due
 * Block 24540: Processes due review/referral sequence messages
 * This should be called by a cron job (e.g., every 15 minutes)
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if provided
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Find all due messages
    const { data: dueMessages, error: fetchError } = await supabase
      .from("review_referral_messages")
      .select(`
        *,
        review_referral_sequences!inner(
          id,
          lead_id,
          workspace_id,
          status,
          current_phase,
          current_step
        ),
        leads!review_referral_messages_lead_id_fkey(
          id,
          email,
          first_name,
          last_name,
          city,
          address
        )
      `)
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .limit(50); // Process in batches

    if (fetchError) {
      console.error("Error fetching due messages:", fetchError);
      return NextResponse.json({ error: "Failed to fetch due messages" }, { status: 500 });
    }

    if (!dueMessages || dueMessages.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0 });
    }

    let sent = 0;
    let failed = 0;
    let cancelled = 0;

    for (const message of dueMessages) {
      try {
        const sequence = message.review_referral_sequences;
        const lead = message.leads;

        // Check if sequence is still active
        if (sequence.status !== 'active') {
          // Cancel message if sequence is not active
          await supabase
            .from("review_referral_messages")
            .update({ status: "cancelled" })
            .eq("id", message.id);
          cancelled++;
          continue;
        }

        // Check if lead is unsubscribed
        const { data: unsubscribed } = await supabase
          .from("leads")
          .select("unsubscribed")
          .eq("id", lead.id)
          .single();

        if (unsubscribed?.unsubscribed) {
          await supabase
            .from("review_referral_messages")
            .update({ status: "cancelled" })
            .eq("id", message.id);
          cancelled++;
          continue;
        }

        // Get workspace sender email
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("id, name")
          .eq("id", sequence.workspace_id)
          .single();

        // Get sender account for workspace
        const { data: senderAccount } = await supabase
          .from("sender_accounts")
          .select("email, provider")
          .eq("workspace_id", sequence.workspace_id)
          .eq("is_active", true)
          .limit(1)
          .single();

        const fromEmail = senderAccount?.email || process.env.EMAIL_FROM || "noreply@smartsend.ai";

        // Personalize message content
        const firstName = lead.first_name || "there";
        const city = lead.city || "your area";
        const neighborhood = lead.address || "your neighborhood";

        // Replace template variables
        let personalizedSubject = message.subject
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{city\}\}/g, city)
          .replace(/\{\{neighborhood\}\}/g, neighborhood);

        let personalizedHtml = message.body_html
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{city\}\}/g, city)
          .replace(/\{\{neighborhood\}\}/g, neighborhood);

        let personalizedText = message.body_text || personalizedHtml.replace(/<[^>]+>/g, "");

        // Get review link if this is a review request
        if (message.phase === 'review_collection') {
          const { data: reviewLink } = await supabase
            .from("review_links")
            .select("review_url")
            .eq("workspace_id", sequence.workspace_id)
            .eq("is_primary", true)
            .eq("is_active", true)
            .limit(1)
            .single();

          if (reviewLink?.review_url) {
            personalizedHtml = personalizedHtml.replace(
              /\{\{google_review_link\}\}/g,
              reviewLink.review_url
            );
            personalizedText = personalizedText.replace(
              /\{\{google_review_link\}\}/g,
              reviewLink.review_url
            );
          }
        }

        // Send email
        await sendEmail({
          to: lead.email,
          from: fromEmail,
          subject: personalizedSubject,
          body: personalizedHtml || personalizedText,
          workspace_id: sequence.workspace_id,
        });

        // Mark message as sent
        await supabase
          .from("review_referral_messages")
          .update({
            status: "sent",
            sent_at: now,
          })
          .eq("id", message.id);

        // Update sequence step
        await supabase
          .from("review_referral_sequences")
          .update({
            current_step: message.step_number,
            updated_at: now,
          })
          .eq("id", sequence.id);

        // If this was the last message in a phase, move to next phase
        if (message.phase === 'review_collection' && message.step_number === 3) {
          await supabase
            .from("review_referral_sequences")
            .update({
              current_phase: 'referral_generation',
              referral_generation_started_at: now,
              current_step: 0,
              updated_at: now,
            })
            .eq("id", sequence.id);
        } else if (message.phase === 'referral_generation' && message.step_number === 3) {
          await supabase
            .from("review_referral_sequences")
            .update({
              current_phase: 'long_term_relationship',
              long_term_started_at: now,
              current_step: 0,
              updated_at: now,
            })
            .eq("id", sequence.id);
        } else if (message.phase === 'long_term_relationship' && message.step_number === 3) {
          // Sequence completed
          await supabase
            .from("review_referral_sequences")
            .update({
              status: 'completed',
              updated_at: now,
            })
            .eq("id", sequence.id);
        }

        sent++;
      } catch (error: any) {
        console.error(`Error processing message ${message.id}:`, error);
        
        // Mark as failed
        await supabase
          .from("review_referral_messages")
          .update({
            status: "failed",
          })
          .eq("id", message.id);

        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: dueMessages.length,
      sent,
      failed,
      cancelled,
    });
  } catch (error: any) {
    console.error("Review/referral process error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process review/referral messages" },
      { status: 500 }
    );
  }
}

