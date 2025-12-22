/**
 * POST /api/reply-webhook
 * 
 * Webhook endpoint for Gmail reply detection.
 * Uses OpenAI to verify if an incoming email is a real human reply,
 * then automatically marks the lead as replied in the database.
 * 
 * Request Body:
 * {
 *   threadId: string (Gmail thread ID)
 *   from: string (sender email)
 *   subject: string (email subject)
 *   snippet?: string (optional preview)
 *   body: string (email body text)
 * }
 * 
 * Response:
 * {
 *   success: boolean
 *   human_reply: boolean
 *   threadId: string
 * }
 * 
 * This powers SmartSend's AI Reply Detection — marking leads as replied
 * automatically when a human reply is detected via Gmail API.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { threadId, from, subject, snippet, body } = await req.json();

    if (!threadId || !from || !body) {
      return NextResponse.json(
        { error: "Missing required fields: threadId, from, body" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const openai = getOpenAI();

    // Step 1: Analyze with AI to confirm if it's a real human reply
    const aiCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Decide if this email message is a real human reply or an automated response (including auto-replies, out-of-office messages, delivery receipts, bounce notifications, etc.). Respond only with 'yes' for human replies or 'no' for automated messages.",
        },
        {
          role: "user",
          content: `Subject: ${subject || "(no subject)"}\nBody: ${body}`,
        },
      ],
    });

    const isHuman =
      aiCheck.choices[0].message.content?.trim().toLowerCase() === "yes";

    if (isHuman) {
      // Step 2: Find the email_log entry by thread_id to get lead_id
      const { data: emailLog, error: logError } = await supabase
        .from("email_logs")
        .select("id, lead_id, workspace_id")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (logError) {
        console.error("Error fetching email_log:", logError);
      }

      if (emailLog?.lead_id) {
        // Update the lead with reply timestamp
        const { error: leadError } = await supabase
          .from("leads")
          .update({ 
            last_replied_at: new Date().toISOString() 
          })
          .eq("id", emailLog.lead_id);

        if (leadError) {
          console.error("Failed to update lead:", leadError);
        }
      }

      if (emailLog?.id) {
        // Update email_logs to mark as replied
        const { error: logUpdateError } = await supabase
          .from("email_logs")
          .update({
            status: "replied",
            replied_at: new Date().toISOString(),
          })
          .eq("id", emailLog.id);

        if (logUpdateError) {
          console.error("Failed to update email_log:", logUpdateError);
        }
      }

      // Log it for dashboard insights
      await supabase.from("logs").insert([
        {
          type: "reply_detected",
          message: `Reply detected from ${from}: "${subject}"`,
          data: { from, subject, snippet, threadId },
        },
      ]);
    }

    return NextResponse.json({ 
      success: true, 
      human_reply: isHuman,
      threadId 
    });
  } catch (error) {
    console.error("Reply detection error:", error);
    return NextResponse.json(
      { error: "Failed to process reply." },
      { status: 500 }
    );
  }
}