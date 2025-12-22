import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/org";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ role: null });
  return NextResponse.json({ role: org.role, org_id: org.id, org_name: org.name });
}