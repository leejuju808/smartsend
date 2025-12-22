import { NextResponse } from "next/server";

export async function POST() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sendWorker`, {
    method: "POST",
    headers: {
      "x-cron-token": process.env.SEND_WORKER_TOKEN || "",
    },
  });
  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
