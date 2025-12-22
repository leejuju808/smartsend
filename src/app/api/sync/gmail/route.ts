import { NextResponse } from "next/server";

export async function POST() {
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/poll-gmail`;
  const r = await fetch(fnUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}` },
  });
  const j = await r.json();
  return NextResponse.json(j, { status: r.status });
}

