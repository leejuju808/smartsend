import { NextResponse } from "next/server";
import { gmailSend } from "@/lib/google";

export async function POST(req: Request) {
  try {
    const key = req.headers.get("x-worker-key");
    if ((process.env.WORKER_SECRET || "") !== key) {
      return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
    }

    const { accessToken, from, to, subject, text, html } = await req.json();
    const messageId = await gmailSend({ accessToken, from, to, subject, text, html });
    return NextResponse.json({ ok: true, messageId });
  } catch (e: any) {
    console.error("Gmail send error:", e);
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
  }
}
