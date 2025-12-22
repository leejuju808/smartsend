import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  const url = `${process.env.NEXT_PUBLIC_FUNCTIONS_BASE}/draft-neutral-nudge`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const headers = new Headers();
  const upstreamType = res.headers.get("content-type");
  headers.set("Content-Type", upstreamType || "application/json");

  return new NextResponse(text, { status: res.status, headers });
}








