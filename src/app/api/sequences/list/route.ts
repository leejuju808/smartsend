import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

/** Replace with real auth */
function getUserId(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("userId");
}

export async function GET(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url)
  const teamId = url.searchParams.get('teamId')
  const { data, error } = teamId
    ? await supabaseAdmin
        .from('sequences')
        .select('id,name,status,created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
    : await supabaseAdmin.rpc("sequences_with_metrics", { p_owner: userId });
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

