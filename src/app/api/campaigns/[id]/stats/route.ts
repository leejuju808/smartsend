import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const s = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookies() }
  );

  // Fetch daily stats from the new campaign_daily_stats view (Block 240)
  const { data: stats, error } = await s
    .from("campaign_daily_stats")
    .select("*")
    .eq("campaign_id", params.id)
    .order("day", { ascending: true });

  if (error) {
    console.error("campaign_daily_stats error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(stats ?? []);
}