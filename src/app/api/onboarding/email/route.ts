import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Send onboarding email from julian@smartsendhq.com
async function sendOnboardingEmail(to: string) {
  const mailProvider = process.env.MAIL_PROVIDER || 'smtp';
  
  // Use Resend if available
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const { data, error } = await resend.emails.send({
      from: "Julian <julian@smartsendhq.com>",
      to: [to],
      subject: "Welcome to SmartSend ⚡ — Your Cold Email OS is Ready",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); color: #ffd700; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
              .cta-button { display: inline-block; background: #000; color: #ffd700; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚡ Welcome to SmartSend</h1>
                <p>The Cold Email OS</p>
              </div>
              <div class="content">
                <p>Hey there,</p>
                <p>Welcome to SmartSend — the all-in-one platform that automates your cold email campaigns from upload → send → detect → reply.</p>
                
                <h3>🚀 Get Started in 3 Steps:</h3>
                <ol>
                  <li><strong>Connect your Gmail</strong> — Link your sending account in Settings → Email Connections</li>
                  <li><strong>Import your leads</strong> — Upload a CSV or add contacts manually</li>
                  <li><strong>Launch your first campaign</strong> — Create a sequence and watch SmartSend handle the rest</li>
                </ol>
                
                <div style="text-align: center;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://smartsendhq.com'}/dashboard" class="cta-button">
                    Go to Dashboard →
                  </a>
                </div>
                
                <h3>💡 Pro Tips:</h3>
                <ul>
                  <li><strong>AI Reply Detection</strong> — Automatically marks leads as "replied" when they respond (92%+ accuracy)</li>
                  <li><strong>Smart Sequences</strong> — Set up multi-step campaigns with delays and personalization</li>
                  <li><strong>Analytics Dashboard</strong> — Track opens, clicks, replies, and conversions in real-time</li>
                </ul>
                
                <p>Need help? Reply to this email or check out our docs at <a href="https://smartsendhq.com">smartsendhq.com</a>.</p>
                
                <p>Let's make your cold outreach work while you sleep.</p>
                
                <p>
                  ⚡ Julian<br>
                  Founder, SmartSend
                </p>
              </div>
              <div class="footer">
                <p>SmartSend AI — Automate Cold Email End-to-End</p>
                <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://smartsendhq.com'}/settings">Manage Preferences</a></p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
Welcome to SmartSend ⚡ — Your Cold Email OS is Ready

Hey there,

Welcome to SmartSend — the all-in-one platform that automates your cold email campaigns.

Get Started in 3 Steps:
1. Connect your Gmail — Link your sending account in Settings → Email Connections
2. Import your leads — Upload a CSV or add contacts manually
3. Launch your first campaign — Create a sequence and watch SmartSend handle the rest

Go to Dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'https://smartsendhq.com'}/dashboard

Pro Tips:
- AI Reply Detection — Automatically marks leads as "replied" (92%+ accuracy)
- Smart Sequences — Set up multi-step campaigns with delays
- Analytics Dashboard — Track opens, clicks, replies in real-time

Need help? Reply to this email or check smartsendhq.com

⚡ Julian
Founder, SmartSend
      `.trim(),
    });

    if (error) {
      throw new Error(`Resend error: ${error}`);
    }
    
    return { success: true, provider: 'resend' };
  }

  // Fallback to SMTP
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: '"Julian" <julian@smartsendhq.com>',
    to,
    subject: "Welcome to SmartSend ⚡ — Your Cold Email OS is Ready",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #ffd700;">⚡ Welcome to SmartSend</h1>
            <p>Hey there,</p>
            <p>Welcome to SmartSend — the all-in-one platform that automates your cold email campaigns.</p>
            <h3>🚀 Get Started:</h3>
            <ol>
              <li>Connect your Gmail</li>
              <li>Import your leads</li>
              <li>Launch your first campaign</li>
            </ol>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://smartsendhq.com'}/dashboard" style="background: #000; color: #ffd700; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to Dashboard →</a></p>
            <p>⚡ Julian<br>Founder, SmartSend</p>
          </div>
        </body>
      </html>
    `,
  });

  return { success: true, provider: 'smtp' };
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Send onboarding email
    await sendOnboardingEmail(email);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Onboarding email error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send email" },
      { status: 500 }
    );
  }
}

