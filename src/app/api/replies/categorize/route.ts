import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { thread_id, body } = await req.json();

    if (!thread_id || !body) {
      return NextResponse.json({ error: "Missing thread_id or body" }, { status: 400 });
    }

    // Categorize the reply
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Categorize email replies into one of these categories:
- interested: Lead shows interest, wants to learn more, asks questions
- not_interested: Lead explicitly declines or says not interested
- meeting: Lead wants to schedule a meeting or call
- ooo: Out of office message
- unsubscribe: Lead wants to unsubscribe or opt out
- bounce: Bounce message or delivery failure
- unclear: Unclear intent, needs human review

Respond with ONLY the category name, nothing else.`,
        },
        { role: "user", content: body },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    const category = res.choices[0]?.message?.content?.trim().toLowerCase() || "unclear";

    // Normalize category to match our enum
    let normalizedCategory = "unclear";
    if (category.includes("interested")) normalizedCategory = "interested";
    else if (category.includes("not_interested") || category.includes("not interested")) normalizedCategory = "not_interested";
    else if (category.includes("meeting")) normalizedCategory = "meeting";
    else if (category.includes("ooo") || category.includes("out of office")) normalizedCategory = "ooo";
    else if (category.includes("unsubscribe")) normalizedCategory = "unsubscribe";
    else if (category.includes("bounce")) normalizedCategory = "bounce";
    else if (category.includes("unclear")) normalizedCategory = "unclear";

    // Update thread with category
    await supabase
      .from("reply_threads")
      .update({ ai_category: normalizedCategory })
      .eq("id", thread_id);

    // If meeting, extract meeting details
    if (normalizedCategory === "meeting") {
      try {
        const meetingRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Extract meeting details from the email. Return JSON only with this structure:
{
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "timezone": "timezone or null",
  "location": "location string or null",
  "duration": "duration in minutes or null",
  "notes": "any additional notes"
}

If information is not available, use null.`,
            },
            { role: "user", content: body },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const meetingData = JSON.parse(meetingRes.choices[0]?.message?.content || "{}");

        // Get thread info for activity log
        const { data: thread } = await supabase
          .from("reply_threads")
          .select("account_id, lead_id, company_id, campaign_id")
          .eq("id", thread_id)
          .single();

        if (thread) {
          // Log to activity_log
          await supabase.from("activity_log").insert({
            account_id: thread.account_id,
            lead_id: thread.lead_id,
            company_id: thread.company_id,
            campaign_id: thread.campaign_id,
            event_type: "email_reply",
            meta: { meeting: meetingData, category: normalizedCategory },
          });
        }
      } catch (meetingErr) {
        console.error("Failed to extract meeting details:", meetingErr);
        // Don't fail if meeting extraction fails
      }
    }

    return NextResponse.json({ category: normalizedCategory });
  } catch (e: any) {
    console.error("Error categorizing reply:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}












