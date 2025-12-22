import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const org_id = cookies().get("org_id")?.value || null;
  return NextResponse.json({ org_id });
}

export async function POST(req: Request) {
  const { org_id } = await req.json();
  const res = NextResponse.json({ ok: true, org_id });
  res.cookies.set("org_id", org_id, { path: "/", httpOnly: false });
  return res;
}

