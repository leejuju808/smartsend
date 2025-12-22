// /app/api/workspaces/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { getUserWorkspaces, createWorkspace } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const workspaces = await getUserWorkspaces();
  return NextResponse.json({ workspaces });
}

export async function POST(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
  }

  try {
    const workspace = await createWorkspace(name);
    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Error creating workspace:", error);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }
}