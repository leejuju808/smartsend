import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const pack = new URL(req.url).searchParams.get("pack") || "200";
  // front to POST /api/billing/topup (client must do POST). We'll bounce to a small landing
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?topup=${pack}`);
} 