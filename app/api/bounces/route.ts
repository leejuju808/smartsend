import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createClient } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;
  const supabase = createClient();
  const limit = Number(new URL(req.url).searchParams.get("limit") || 50);
  const { data, error } = await supabase
    .from("email_bounces")
    .select("created_at, recipient, kind, smtp_status, diagnostic")
    .eq("workspace_id", gate.workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}