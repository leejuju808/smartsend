import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/entitlements";

export async function GET() {
  try {
    const ent = await getEntitlements();
    return NextResponse.json(ent);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

