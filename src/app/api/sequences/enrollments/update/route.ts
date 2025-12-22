import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const { enrollmentId, action } = await req.json(); // pause | resume | stop
  const cookieStore = cookies();
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies:{ get:(k)=>cookieStore.get(k)?.value }});
  const { data:{ user }} = await sb.auth.getUser(); if(!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  const patch = action === "pause" ? { status:"paused", next_scheduled_at: null }
    : action === "resume" ? { status:"active", next_scheduled_at: new Date().toISOString() }
    : action === "stop" ? { status:"stopped", next_scheduled_at: null }
    : null;
  if (!patch) return NextResponse.json({ error:"Bad action" }, { status:400 });

  const { error } = await sb.from("sequence_enrollments").update(patch).eq("id", enrollmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok:true });
}