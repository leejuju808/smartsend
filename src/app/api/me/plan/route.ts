import { NextResponse } from "next/server";
import { getUserPlan } from "@/lib/getUserPlan";

export async function GET() {
  const { plan, status } = await getUserPlan();
  return NextResponse.json({ plan, status });
}