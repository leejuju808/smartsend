import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { subject, body, post_id } = await req.json();

    if (!subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing subject or body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get waitlist emails and active user emails
    const [waitlistResult, usersResult] = await Promise.all([
      supabase
        .from("waitlist")
        .select("email")
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("email")
        .not("email", "is", null)
        .limit(1000), // Limit to prevent huge broadcasts
    ]);

    const waitlistEmails = (waitlistResult.data || []).map((w) => w.email);
    const userEmails = (usersResult.data || []).map((p) => p.email).filter(Boolean);
    
    // Combine and deduplicate emails
    const allEmails = [...new Set([...waitlistEmails, ...userEmails])];

    if (allEmails.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: "No recipients found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use Resend API to send emails
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const fromEmail = Deno.env.get("RESEND_FROM") || "SmartSend <noreply@smartsend.ai>";
    
    // Send emails individually (Resend doesn't support true batch sending)
    // Process in smaller batches with delays to avoid rate limits
    const batchSize = 10;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < allEmails.length; i += batchSize) {
      const batch = allEmails.slice(i, i + batchSize);
      
      // Send emails in parallel within each batch
      const batchPromises = batch.map(async (email) => {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: email,
              subject: subject,
              html: body,
              text: body.replace(/<[^>]*>/g, ""), // Strip HTML for text version
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to send to ${email}:`, errorText);
            return { email, success: false };
          }

          return { email, success: true };
        } catch (error) {
          console.error(`Error sending to ${email}:`, error);
          return { email, success: false };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result) => {
        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      });

      // Small delay between batches to avoid rate limits (Resend limit: ~10/sec)
      if (i + batchSize < allEmails.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    // Log to waitlist_emails table if it exists
    try {
      const emailRecords = allEmails.slice(0, sent).map((email) => ({
        email,
        type: "update",
        sent_at: new Date().toISOString(),
        post_id: post_id || null,
      }));

      // Insert in chunks to avoid payload limits
      for (let i = 0; i < emailRecords.length; i += 100) {
        const chunk = emailRecords.slice(i, i + 100);
        await supabase.from("waitlist_emails").insert(chunk).select();
      }
    } catch (error) {
      // Non-critical: continue even if logging fails
      console.warn("Failed to log to waitlist_emails:", error);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        failed,
        total: allEmails.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in email-broadcast:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

