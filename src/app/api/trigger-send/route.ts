import { NextResponse } from "next/server";

export async function POST() {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-queued-emails?token=${process.env.TRIGGER_TOKEN}`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}