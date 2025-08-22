import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function getUserId(req: Request) { return new URL(req.url).searchParams.get("userId"); }

export async function GET(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("mailboxes").select("provider,from_email").eq("owner", userId).single();
  if (error || !data) return NextResponse.json({ error: "No mailbox" }, { status: 404 });
  const from_email = data.from_email as string;
  const domain = from_email.includes("@") ? from_email.split("@")[1] : "";
  return NextResponse.json({ provider: (data as any).provider, from_email, domain });
}

