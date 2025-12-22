import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const base = process.env.NEXT_PUBLIC_FUNCTIONS_BASE;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!base || !serviceRole) {
      return NextResponse.json(
        { error: "Preflight function configuration missing" },
        { status: 500 },
      );
    }

    const response = await fetch(`${base}/preflight-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRole}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    console.error("preflight proxy error", error);
    return NextResponse.json({ error: "Failed to reach preflight check" }, { status: 500 });
  }
}

