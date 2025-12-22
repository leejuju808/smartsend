import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { logErrorToMonitors } from "../_shared/monitoring.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

serve(async (req) => {
  try {
    console.log("AI Customer Agent: Starting check-in process");

    // Step 1: Refresh health metrics from actual activity
    console.log("Refreshing customer health metrics...");
    const { error: refreshError } = await supabase.rpc("refresh_customer_health_metrics");
    if (refreshError) {
      console.error("Error refreshing health metrics:", refreshError);
      await logErrorToMonitors("ai-customer-agent", refreshError);
    }

    // Step 2: Find users with low engagement scores
    const { data: atRiskUsers, error: usersError } = await supabase
      .from("customer_health")
      .select(`
        id,
        user_id,
        ai_score,
        last_login,
        emails_sent,
        replies_received,
        last_check_in
      `)
      .or("ai_score.lt.60,ai_score.is.null")
      .limit(50);

    if (usersError) {
      console.error("Error fetching at-risk users:", usersError);
      await logErrorToMonitors("ai-customer-agent", usersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!atRiskUsers || atRiskUsers.length === 0) {
      console.log("No at-risk users found");
      return new Response(
        JSON.stringify({ ok: true, message: "No users need check-ins" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${atRiskUsers.length} at-risk users`);

    // Step 3: Get user email addresses
    const userIds = atRiskUsers.map(u => u.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profilesError || !profiles) {
      console.error("Error fetching user profiles:", profilesError);
      await logErrorToMonitors("ai-customer-agent", profilesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profiles" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create a map for quick lookup
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Step 4: Generate and send personalized check-in emails
    let sent = 0;
    let failed = 0;

    for (const user of atRiskUsers) {
      const profile = profileMap.get(user.user_id);
      if (!profile || !profile.email) {
        console.log(`Skipping user ${user.user_id} - no email found`);
        continue;
      }

      try {
        // Calculate days since last login
        const daysSinceLogin = user.last_login
          ? Math.floor((Date.now() - new Date(user.last_login).getTime()) / 86400000)
          : null;

        // Generate personalized message using OpenAI
        const prompt = `Write a short, friendly check-in email to a SmartSend user named ${profile.full_name || 'there'} who has an engagement score of ${user.ai_score || 0}. 

They last logged in ${daysSinceLogin ? `${daysSinceLogin} days ago` : 'never logged in'}. 
They've sent ${user.emails_sent || 0} emails in the last 30 days and received ${user.replies_received || 0} replies.

Encourage them to:
- Try sending their first campaign if they haven't yet
- Check their inbox analytics if they have campaigns running
- Reach out if they need help getting started

Tone: helpful, encouraging, not salesy. Keep it under 150 words.`;

        const aiResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 200,
        });

        const message = aiResponse.choices[0]?.message?.content?.trim();
        if (!message) {
          console.error(`No message generated for user ${user.user_id}`);
          failed++;
          continue;
        }

        // Send email via Resend
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("RESEND_FROM") || "SmartSend <noreply@smartsend.ai>";

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: profile.email,
            subject: "SmartSend Check-In ⚡",
            html: `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${profile.full_name || 'there'}!</h2>
              <div style="line-height: 1.6; color: #555; margin-bottom: 20px;">${message.replace(/\n/g, '<br>')}</div>
              <a href="https://app.smartsend.ai/dashboard" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px;">Open Dashboard →</a>
              <p style="color: #999; font-size: 12px; margin-top: 30px;">Need help? Just reply to this email.</p>
            </div>`,
            text: message,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Failed to send to ${profile.email}:`, errorText);
          failed++;
          continue;
        }

        // Update last_check_in timestamp
        await supabase
          .from("customer_health")
          .update({ last_check_in: new Date().toISOString() })
          .eq("id", user.id);

        console.log(`Check-in sent to ${profile.email}`);
        sent++;

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Error processing user ${user.user_id}:`, error);
        await logErrorToMonitors("ai-customer-agent", error, { user_id: user.user_id });
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: atRiskUsers.length,
        sent,
        failed,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-customer-agent:", error);
    await logErrorToMonitors("ai-customer-agent", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

