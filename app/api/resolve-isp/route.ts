import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { domain } = await req.json();
  const r = await fetch(process.env.ISP_RESOLVE_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  });

  const json = await r.json();
  return NextResponse.json(json, { status: r.status });
}

