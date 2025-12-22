import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { userId, name, seats } = await req.json();
    if (!userId || !name) return NextResponse.json({ error: "userId and name required" }, { status: 400 });

    const sb = createClient(url, service, { auth: { persistSession: false } });
    const { data: org, error } = await sb
      .from("organizations")
      .insert({ name, owner_id: userId, seats: seats ?? 3 })
      .select("id,name,seats")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from("org_members").insert({ org_id: org.id, user_id: userId, role: "owner" });

    return NextResponse.json({ org });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


