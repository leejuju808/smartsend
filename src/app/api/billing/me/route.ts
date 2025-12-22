import { NextResponse } from "next/server";
import { getUserPlan } from "@/lib/billing/getUserPlan";

export async function GET() {
  const plan = await getUserPlan();
  return NextResponse.json({ ok: true, plan });
}


