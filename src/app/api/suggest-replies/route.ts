import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const edgeUrl = process.env.NEXT_PUBLIC_EDGE_URL;

  if (!edgeUrl) {
    return NextResponse.json(
      { ok: false, error: "EDGE_URL not configured" },
      { status: 500 },
    );
  }

  const res = await fetch(`${edgeUrl}/suggest-replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}


