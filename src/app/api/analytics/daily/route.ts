import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;
  const supabase = getServerSupabase();

  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") || 30);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("analytics_daily")
    .select("*")
    .eq("workspace_id", gate.workspace_id)
    .gte("d", since.toISOString().slice(0,10))
    .order("d", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data });
}