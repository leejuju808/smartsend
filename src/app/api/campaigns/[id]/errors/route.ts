import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const s = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookies() }
  );
  const { data } = await s
    .from("campaign_send_errors")
    .select("*")
    .eq("campaign_id", params.id)
    .limit(50);
  return NextResponse.json({ rows: data ?? [] });
}

