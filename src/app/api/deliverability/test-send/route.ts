export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function smtp() {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  if (!host || !user || !pass) throw new Error("SMTP env missing");
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    const body = await req.json().catch(() => ({}));
    const to = String((body as any)?.to || process.env.TEST_SEND_TO || user?.email || "").trim();
    if (!to) return NextResponse.json({ error: "No recipient" }, { status: 400 });

    const fromName = process.env.SMTP_FROM_NAME || "SmartSend";
    const fromEmail = process.env.SMTP_FROM_EMAIL || "no-reply@yoursite.com";

    const transport = smtp();
    const info = await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: "SmartSend test – deliverability check",
      text: "If you see this in Inbox (not Spam), your domain is in good shape.\n\n– SmartSend",
    });

    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Send failed" }, { status: 500 });
  }
}

