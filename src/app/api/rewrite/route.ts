import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/rewrite`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET ?? "",
      },
      body: JSON.stringify(body),
    },
  );

  const j = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: j?.error ?? "rewrite failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(j);
}
