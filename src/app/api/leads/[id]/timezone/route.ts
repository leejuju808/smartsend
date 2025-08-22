import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { isIana } from "@/lib/tz";

function getUserId(req: Request){ return new URL(req.url).searchParams.get("userId"); }

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const { tz } = await req.json().catch(()=> ({}));
  if (!isIana(tz)) return NextResponse.json({ error:"Invalid timezone" }, { status:400 });

  const { data: ownerProfile } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).single();
  const ownerEmail = ownerProfile?.email;
  if (!ownerEmail) return NextResponse.json({ error: "Owner email not found" }, { status: 400 });

  const { error } = await supabaseAdmin.from("leads")
    .update({ tz }).eq("id", params.id).eq("owner_email", ownerEmail);
  if (error) return NextResponse.json({ error:String(error) }, { status:500 });
  return NextResponse.json({ ok:true });
}

