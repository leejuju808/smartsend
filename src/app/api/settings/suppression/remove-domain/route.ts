import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { unsuppressDomain } from "@/lib/hygiene/suppression";

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain } = await req.json();
  if (!domain) {
    return NextResponse.json({ error: "Domain required" }, { status: 400 });
  }

  try {
    await unsuppressDomain(user.id, domain);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

