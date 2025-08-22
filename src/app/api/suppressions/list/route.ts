import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function getUserId(req: Request) {
  return new URL(req.url).searchParams.get("userId");
}

export async function GET(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("suppressions")
    .select("email, reason, source, created_at")
    .eq("owner", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

