// app/api/send-test/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import TestEmail from "@/emails/TestEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { to, subject, previewText, body } = await req.json();

    if (!to || typeof to !== "string") {
      return NextResponse.json({ error: "Missing 'to' email." }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured. Add it to .env.local." },
        { status: 501 }
      );
    }

    const from = process.env.EMAIL_FROM ?? "SmartSend <no-reply@example.com>";

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: subject || "SmartSend — Test Email",
      react: TestEmail({ previewText, body }),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ id: data?.id, ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}