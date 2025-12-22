import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const orgId = u.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const sb = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("org_members")
    .select("user_id, role, joined_at")
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}


