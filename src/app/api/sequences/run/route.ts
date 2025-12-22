import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMailSafe } from "@/lib/email/send";
import { injectTracking } from "@/lib/tracking/utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    // 1. Find contacts enrolled in sequences with due steps
    const { data: steps, error: stepsError } = await supabase.rpc("due_sequence_steps");
    
    if (stepsError) {
      console.error("Error fetching due steps:", stepsError);
      return NextResponse.json({ error: "Failed to fetch due steps" }, { status: 500 });
    }
    
    if (!steps?.length) {
      return NextResponse.json({ ok: true, ran: 0, sent: 0 });
    }

    let sent = 0;
    let errors = 0;
    
    for (const step of steps) {
      try {
        // Inject tracking into email content
        const tracked = await injectTracking({
          workspaceId: step.workspace_id,
          email: step.email,
          subscriberId: step.subscriber_id,
          sequenceId: step.sequence_id,
          stepNo: step.step_no,
          html: step.body_html || "",
          text: step.body_text || "",
        });

        await sendMailSafe({
          to: step.email,
          subject: step.subject,
          text: tracked.text,
          html: tracked.html,
          from: process.env.EMAIL_FROM || "noreply@smartsend.ai",
        });
        
        // Mark step as sent
        const { error: markError } = await supabase.rpc("mark_sequence_step_sent", {
          step_id: step.id,
          email: step.email
        });
        
        if (markError) {
          console.error("Error marking step sent:", markError);
        } else {
          sent++;
        }
        
      } catch (e: any) {
        console.error("Send fail for step:", step.id, e);
        errors++;
      }
    }

    return NextResponse.json({ 
      ok: true, 
      ran: steps.length, 
      sent,
      errors 
    });
    
  } catch (error) {
    console.error("Sequence runner error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 