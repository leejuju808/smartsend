import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";

export async function GET() {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ logs: [] });

  const { data } = await sb
    .from("audit_logs")
    .select("id,action,target_type,target_id,meta,created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({ logs: data ?? [] });
}