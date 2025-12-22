import { NextResponse } from "next/server";
import { sendDue } from "@/lib/sender";

export async function GET() {
  const res = await sendDue(Number(process.env.SEND_BATCH_LIMIT || "25"));
  return NextResponse.json(res);
}