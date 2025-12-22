import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("campaign_analytics")
    .select("*")
    .eq("workspace_id", gate.workspace_id)
    .eq("campaign_id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analytics: data });
}