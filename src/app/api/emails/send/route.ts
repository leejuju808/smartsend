import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { to, subject, text } = await req.json();
  
  if (!to || !subject || !text) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // For now, just log the email (you can integrate with your preferred email service)
  console.log("Email would be sent:", { to, subject, text });
  
  // TODO: Integrate with your email service (Resend, SendGrid, etc.)
  // Example with Resend:
  // try {
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({
  //     from: 'noreply@yourdomain.com',
  //     to: [to],
  //     subject,
  //     text
  //   });
  // } catch (error) {
  //   console.error('Failed to send email:', error);
  //   return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  // }

  return NextResponse.json({ ok: true, message: "Email logged (integration pending)" });
} 