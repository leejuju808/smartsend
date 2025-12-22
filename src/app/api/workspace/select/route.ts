// /app/api/workspace/select/route.ts (persist selection cookie)
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function POST(req: NextRequest) {
  const { workspace_id } = await req.json();
  const gate = await requireWorkspace(new NextRequest(new URL(req.url), { headers: new Headers({ "x-workspace-id": workspace_id }) }));
  if ("error" in gate) return gate.error;
  const res = NextResponse.json({ ok: true });
  res.cookies.set("active_wid", workspace_id, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}