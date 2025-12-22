import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FUNCTIONS_BASE}/draft-schedule`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    },
  );

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}








