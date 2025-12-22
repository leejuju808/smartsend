import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces!inner(id, name)")
    .order("created_at", { ascending: true });
  if (error) return new NextResponse(error.message, { status: 500 });
  const items = (data ?? []).map((r: any) => ({ id: r.workspaces.id, name: r.workspaces.name, role: r.role }));
  return NextResponse.json(items);
}
