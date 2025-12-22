import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/mobile/inbox/[id]/ai-suggestions
 * Get AI response suggestions for a lead reply
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = createClient();

    // Get the inbox message
    const { data: message, error: msgError } = await supabase
      .from("inbox_messages")
      .select(`
        id,
        body,
        subject,
        intent_label,
        contacts:contact_id (
          id,
          first_name,
          last_name,
          email,
          lead_status
        )
      `)
      .eq("id", params.id)
      .single();

    if (msgError || !message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Generate AI suggestions based on intent
    const suggestions: string[] = [];

    const contact = message.contacts as any;
    const firstName = contact?.first_name || "there";
    const intent = message.intent_label || "";
    const leadStatus = contact?.lead_status || "";

    // HOT lead suggestions
    if (leadStatus === "hot" || intent === "hot_lead") {
      suggestions.push(
        `Great news, ${firstName}! I can get someone out today or tomorrow to take a look and get you a quote. Which time works best?`,
        `Thanks for getting back to me, ${firstName}! Here's a link to pick a time that works best for you: [booking link]. Let me know if you need anything else.`,
        `Perfect timing, ${firstName}! We can take care of that for you. I can schedule a free inspection this week. What day works best?`
      );
    }
    // WARM lead suggestions
    else if (leadStatus === "warm" || intent === "warm_lead") {
      suggestions.push(
        `Thanks for the interest, ${firstName}! I'd love to help you with your roof. Would you like to schedule a free inspection?`,
        `Hi ${firstName}, I can swing by for a quick inspection and give you a straightforward quote. Takes about 10-15 minutes. Would tomorrow or Thursday work?`,
        `Hey ${firstName}, just wanted to circle back. If you still need someone to take a look at your roof, I can get you a free estimate this week. No pressure - just reply here and I'll get you on the schedule.`
      );
    }
    // General reply suggestions
    else {
      suggestions.push(
        `Thanks for getting back to me, ${firstName}! I'd be happy to help. Would you like to schedule a free inspection?`,
        `Hi ${firstName}, I can take a look at your roof and provide a quote. What's the best way to reach you?`,
        `Thanks for reaching out, ${firstName}! Let me know what you need help with and I'll get back to you right away.`
      );
    }

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error("Error generating AI suggestions:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}






































