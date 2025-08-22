import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { randomBytes } from "crypto";

function getUserId(req: Request){ return new URL(req.url).searchParams.get("userId"); }
function makeShortCode(){ return randomBytes(4).toString("hex"); }

export async function GET(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  const sb = createAdminClient();
  const { data: prof } = await sb.from("profiles")
    .select("id, referral_code").eq("id", userId).single();

  if (!prof) return NextResponse.json({ error:"Profile not found" }, { status:404 });

  let code = (prof as any).referral_code as string | null;
  if (!code) {
    for (let i=0;i<3 && !code;i++){
      const cand = makeShortCode();
      const { error } = await sb.from("profiles").update({ referral_code: cand }).eq("id", userId);
      if (!error) code = cand;
    }
  }
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/signup?ref=${code}`;
  return NextResponse.json({ link, code });
}