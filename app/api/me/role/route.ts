import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/auth/getUserRole";

export async function GET() {
  const role = await getUserRole();
  return NextResponse.json(role ?? {});
}












