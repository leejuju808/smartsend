import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";
import { getInboxItems } from "@/lib/db";

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k) => cookieStore.get(k)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") as
    | "all"
    | "replied"
    | "unreplied"
    | null;

  const { data, error } = await getInboxItems(supabase, {
    userId: user.id,
    filter: filter || "all",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ items: data || [] });
}

