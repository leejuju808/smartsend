import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const priceId = body.priceId;
  const plan = body.plan;

  if (!priceId || !plan) {
    return NextResponse.json(
      { error: "missing_fields" },
      { status: 400 }
    );
  }

  // Store upgrade intent in cookie (temporary)
  const cookieStore = await cookies();
  cookieStore.set("upgrade_intent", JSON.stringify({ priceId, plan }), {
    path: "/",
    httpOnly: false, // allow client to read
    maxAge: 60 * 30, // 30 minutes
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}






