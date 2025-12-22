import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req.headers.get("authorization") || undefined);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const { email, first_name, last_name, company, custom, listId } = await req.json();
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const { data: contact, error } = await sb.from("contacts").upsert({
    user_id: auth.userId, email, first_name: first_name || null, last_name: last_name || null,
    company: company || null, custom: custom || {}
  }, { onConflict: "user_id,email" }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (listId) {
    await sb.from("list_members").upsert({ list_id: listId, contact_id: contact!.id }).catch(()=>{});
  }
  return NextResponse.json({ ok: true, contactId: contact!.id });
}