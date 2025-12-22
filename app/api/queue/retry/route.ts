// app/api/queue/retry/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { queue_ids, reason, max_attempts } = await req.json();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/retryQueue`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ queue_ids, reason, max_attempts })
    }
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
