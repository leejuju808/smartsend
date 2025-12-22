// Block 25140 — SmartSend Roofing Homeowner Experience v1
// Background worker: Process pending homeowner confirmations
// Should be called every 5-10 minutes to send pending confirmations

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendHomeownerConfirmation } from "@/lib/homeowner-experience/automation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get pending confirmations (limit to 50 per run)
    const { data: pendingConfirmations, error: fetchError } = await supabase
      .from("homeowner_confirmations")
      .select(`
        id,
        workspace_id,
        job_id,
        lead_id,
        contact_id,
        confirmation_type,
        metadata,
        message_channel
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error("Error fetching pending confirmations:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch confirmations" },
        { status: 500 }
      );
    }

    if (!pendingConfirmations || pendingConfirmations.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No pending confirmations",
      });
    }

    let processed = 0;
    let errors: string[] = [];

    for (const confirmation of pendingConfirmations) {
      try {
        // Send confirmation
        const result = await sendHomeownerConfirmation({
          workspaceId: confirmation.workspace_id,
          jobId: confirmation.job_id || undefined,
          leadId: confirmation.lead_id || undefined,
          contactId: confirmation.contact_id,
          confirmationType: confirmation.confirmation_type as any,
          metadata: confirmation.metadata || {},
          channel: (confirmation.message_channel as "email" | "sms" | "both") || "email",
        });

        if (result.success) {
          // Update confirmation status
          await supabase
            .from("homeowner_confirmations")
            .update({
              status: "sent",
              message_sent_at: new Date().toISOString(),
            })
            .eq("id", confirmation.id);

          processed++;
        } else {
          // Mark as failed
          await supabase
            .from("homeowner_confirmations")
            .update({
              status: "failed",
              error_message: result.error || "Unknown error",
            })
            .eq("id", confirmation.id);

          errors.push(`Confirmation ${confirmation.id}: ${result.error}`);
        }
      } catch (error: any) {
        // Mark as failed
        await supabase
          .from("homeowner_confirmations")
          .update({
            status: "failed",
            error_message: error.message,
          })
          .eq("id", confirmation.id);

        errors.push(`Confirmation ${confirmation.id}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      total: pendingConfirmations.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error processing homeowner confirmations:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































