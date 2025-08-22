import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/server/supabase";
function getUserId(req: Request){ return new URL(req.url).searchParams.get("userId"); }

export async function POST(req: Request) {
  const { userId, email, name, company } = await req.json().catch(()=> ({}));
  if (!userId || !email) return NextResponse.json({ error: "userId/email" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("leads").upsert(
    { owner: userId, email: String(email).toLowerCase(), name: name || null, company: company || null },
    { onConflict: "owner,email" }
  ).select("id").single();
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ id: data!.id });
}

