import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET(req: Request) {
  const supabase = createClient();
  await setAccountContext(supabase);
  const { searchParams } = new URL(req.url);

  const email = searchParams.get("email");
  const domain = searchParams.get("domain");

  let query = supabase.from("leads").select("*");

  if (email) {
    query = query.eq("email", email);
  }
  if (domain) {
    query = query.ilike("email", `%@${domain}`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ leads: data ?? [] });
}

