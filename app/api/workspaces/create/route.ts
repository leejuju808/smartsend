import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name) return new NextResponse("Missing name", { status: 400 });
  const supabase = getServerSupabase();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: name });
  if (error) return new NextResponse(error.message, { status: 500 });
  // also switch to it immediately
  const res = NextResponse.json({ id: data, name });
  res.cookies.set("active_ws", String(data), { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
