import { NextResponse } from "next/server";

export async function POST() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/queueWorker`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SERVICE_WEBHOOK_SECRET!}`,
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}













