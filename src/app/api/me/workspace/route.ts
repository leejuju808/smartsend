// app/api/me/workspace/route.ts
import { NextResponse } from "next/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function GET() {
  const workspaceId = await getActiveWorkspaceId();
  return NextResponse.json({ workspaceId });
}
