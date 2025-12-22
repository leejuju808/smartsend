import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      } 
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ senders: [] });

  const { data, error } = await supabase
    .from("sender_identities")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ senders: data });
}