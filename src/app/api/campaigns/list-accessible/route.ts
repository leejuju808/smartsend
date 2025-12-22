import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies }
  );
  const { data, error } = await supa.from("v_accessible_campaigns").select("id, name").order("name");
  if (error) return new NextResponse(error.message, { status: 400 });
  return NextResponse.json(data);
}

