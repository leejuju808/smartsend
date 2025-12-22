import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

export async function POST() {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // if already member of any org => just set cookie to first org
  const { data: m } = await sb.from("org_members").select("org_id, role, orgs!inner(name)").eq("user_id", user.id).limit(1).maybeSingle();
  if (m?.org_id) {
    cookies().set("org", m.org_id, { path: "/", maxAge: 60*60*24*365 });
    return NextResponse.json({ ok: true, org_id: m.org_id });
  }

  // create a personal org and membership
  const { data: org, error: e1 } = await sb.from("orgs").insert({ owner_id: user.id, name: `${user.email?.split("@")[0] || "Me"} (Personal)` }).select("id").single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const { error: e2 } = await sb.from("org_members").insert({ org_id: org.id, user_id: user.id, role: "owner" });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  cookies().set("org", org.id, { path: "/", maxAge: 60*60*24*365 });
  return NextResponse.json({ ok: true, org_id: org.id });
}