import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function GET() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ enabled: false });
  const { data } = await supabaseAdmin.from("profiles").select("learn_from_sent").eq("id", userId).maybeSingle();
  return NextResponse.json({ enabled: !!data?.learn_from_sent });
}

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });
  const { enabled } = await req.json();
  await supabaseAdmin.from("profiles").update({ learn_from_sent: !!enabled }).eq("id", userId);
  return NextResponse.json({ ok: true });
} 