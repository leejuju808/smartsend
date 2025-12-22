import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resend } from "@/lib/resend";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { data: row, error } = await sb
    .from("sender_identities")
    .select("id,user_id,provider_id")
    .eq("id", params.id)
    .single();
    
  if (error || !row?.provider_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const rd = await resend(`/domains/${row.provider_id}`);
    await sb.from("sender_identities").update({
      status: rd.status || "pending",
      dns: rd.records || [],
      from_email: rd.name ? `no-reply@${rd.name}` : undefined,
    }).eq("id", params.id);

    return NextResponse.json({ ok: true, status: rd.status, dns: rd.records });
  } catch (error) {
    console.error("Error refreshing domain:", error);
    return NextResponse.json({ error: "Failed to refresh domain" }, { status: 500 });
  }
}