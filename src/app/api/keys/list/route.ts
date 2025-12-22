import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";
export async function GET() {
  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k)=>cookieStore.get(k)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ keys: [] });
  const { data, error } = await supabase.from("api_keys")
    .select("id,name,created_at,last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ keys: data });
}