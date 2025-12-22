import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendHtmlEmail } from "@/lib/notify/mailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const EMAIL_SUBJECT = "SmartSend AI v2 is Live ⚡ — Now Multi-Channel";
const EMAIL_BODY = `
<p>Hi there,</p>

<p>You can now run your entire outreach — Email, LinkedIn & WhatsApp — from one dashboard.</p>

<p><strong>👉 <a href="https://smartsendhq.com/demo">Try the Demo</a></strong></p>

<p>New features:</p>
<ul>
  <li>Smart Inbox</li>
  <li>AI Follow-Ups</li>
  <li>Cross-Channel Analytics</li>
</ul>

<p>Thank you for supporting the journey to make cold outreach autonomous.</p>

<p>— Julian Lee ⚡</p>
`;

export async function POST(req: Request) {
  try {
    // Get all waitlist emails
    const { data: waitlistEmails, error: waitlistError } = await supabase
      .from("waitlist")
      .select("email");

    if (waitlistError) {
      console.error("Failed to fetch waitlist:", waitlistError);
      return NextResponse.json(
        { error: "Failed to fetch waitlist" },
        { status: 500 }
      );
    }

    // Get all authenticated users' emails
    const { data: users, error: usersError } = await supabase
      .from("auth.users")
      .select("email")
      .limit(10000);

    // Combine emails (dedupe)
    const emailSet = new Set<string>();
    (waitlistEmails || []).forEach((w: any) => emailSet.add(w.email.toLowerCase()));
    (users || []).forEach((u: any) => emailSet.add(u.email.toLowerCase()));
    
    const emailList = Array.from(emailSet);
    let sent = 0;
    let failed = 0;

    // Send to each email (in batches to avoid rate limits)
    for (const email of emailList) {
      try {
        await sendHtmlEmail({
          to: email,
          subject: EMAIL_SUBJECT,
          html: EMAIL_BODY,
          fromName: "Julian Lee",
          fromEmail: "julian@smartsendhq.com",
        });

        // Log sent
        await supabase.from("waitlist_emails").insert({
          email,
          type: "v2_launch",
        });

        sent++;

        // Track launch event
        await supabase.from("launch_events").insert({
          event: "email_blast_sent",
          source: "waitlist",
          metadata: { email },
        });
      } catch (error) {
        console.error(`Failed to send to ${email}:`, error);
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      total: emailList.length,
      sent,
      failed,
    });
  } catch (error: any) {
    console.error("Email blast error:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

