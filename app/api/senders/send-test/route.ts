import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/senders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { senderId, to } = await req.json();
  if (!senderId || !to) return NextResponse.json({ error: "senderId and to are required" }, { status: 400 });

  try {
    const r = await sendTestEmail(senderId, to);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "send failed" }, { status: 400 });
  }
}


