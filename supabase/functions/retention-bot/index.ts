// Retention Bot Edge Function
// Sends AI-generated re-engagement emails to inactive users

import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const resendFrom = Deno.env.get("RESEND_FROM") || "SmartSend <noreply@smartsendhq.com>";
const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://smartsendhq.com";

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to,
        subject,
        html: text.replace(/\n/g, "<br>"),
        text,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return false;
  }
}

Deno.serve(async () => {
  try {
    // Fetch inactive users from the view (7+ days inactive)
    const { data: users, error: usersError } = await supabase
      .from("inactive_users")
      .select("*")
      .limit(100);

    if (usersError) {
      console.error("Error fetching inactive users:", usersError);
      return new Response(
        JSON.stringify({ ok: false, error: usersError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No inactive users found", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      if (!user.email) {
        console.warn(`Skipping user ${user.user_id}: no email`);
        continue;
      }

      try {
        // Generate personalized re-engagement message using OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Write a short, friendly re-engagement email to ${user.email}${user.full_name ? ` (${user.full_name})` : ''}.
They stopped sending campaigns ${Math.floor(user.days_inactive || 7)} days ago.
Encourage them to log back in with a motivating CTA. Keep it under 150 words.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 300,
        });

        const msg = completion.choices[0]?.message?.content;
        if (!msg) {
          console.error(`Failed to generate message for ${user.email}`);
          failed++;
          continue;
        }

        // Send email via Resend
        const success = await sendEmail(
          user.email,
          "Ready to pick up where you left off?",
          msg
        );

        if (success) {
          sent++;
          console.log(`Sent re-engagement email to ${user.email}`);
        } else {
          failed++;
          console.error(`Failed to send email to ${user.email}`);
        }
      } catch (error) {
        console.error(`Error processing user ${user.user_id}:`, error);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Retention emails processed",
        sent,
        failed,
        total: users.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in retention-bot:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

