import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: NextRequest) {
  const { to } = await req.json();
  if (!to) return NextResponse.json({ error: "Missing to" }, { status: 400 });

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to,
      subject: "Action required: Update your payment method",
      text: `
Hi there,

We couldn't process your last payment for SmartSendAI.

Please update your payment method to avoid interruption:
${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing

Thanks,
SmartSendAI
      `.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
} 