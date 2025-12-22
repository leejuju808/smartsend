import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const key = req.headers.get("x-aurev-sync-key");
  if (key !== process.env.AUREV_SYNC_KEY) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createRouteHandlerClient({ cookies });
  const [{ data: workflows }, { data: tasks }] = await Promise.all([
    supabase.from("workflows").select("id,status"),
    supabase.from("tasks").select("id,status").eq("status","open"),
  ]);

  return NextResponse.json({
    app: "opsgrid",
    active_workflows: (workflows||[]).filter(w=>w.status==="active").length,
    open_tasks: (tasks||[]).length,
  });
}

