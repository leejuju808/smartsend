import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const url = process.env.MERGE_RUNNER_URL;

  if (!url) {
    return NextResponse.json({ ok: false, error: "MERGE_RUNNER_URL not configured" }, { status: 500 });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}

