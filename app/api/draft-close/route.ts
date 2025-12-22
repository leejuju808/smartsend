import { NextRequest, NextResponse } from "next/server";

function functionsBase(): string | null {
  const base =
    process.env.NEXT_PUBLIC_FUNCTIONS_BASE ??
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
    process.env.NEXT_PUBLIC_FUNCTIONS_URL ??
    null;
  if (!base) return null;
  return base.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload.thread_id !== "string") {
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  const base = functionsBase();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    return NextResponse.json(
      { error: "Functions base or service role key not configured" },
      { status: 500 }
    );
  }

  try {
    const resp = await fetch(`${base}/draft-close-loop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    const headers = new Headers();
    headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
    return new NextResponse(text, { status: resp.status, headers });
  } catch (error) {
    console.error("draft-close route error", error);
    return NextResponse.json({ error: "Failed to call draft-close-loop" }, { status: 502 });
  }
}







