import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const key = req.headers.get("x-aurev-sync-key");
  if (key !== process.env.AUREV_SYNC_KEY) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createRouteHandlerClient({ cookies });
  const [{ data: agents }, { data: deployments }] = await Promise.all([
    supabase.from("ai_agents").select("id,status"),
    supabase.from("agent_deployments").select("id,status"),
  ]);

  return NextResponse.json({
    app: "agentcloud",
    active_agents: (agents||[]).filter(a=>a.status==="active").length,
    live_deployments: (deployments||[]).filter(d=>d.status==="live").length,
  });
}

