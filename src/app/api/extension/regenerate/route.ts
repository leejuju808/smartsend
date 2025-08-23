import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function POST() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  // Revoke existing; user will generate a fresh token via /extension/link
  await supabaseAdmin.from("extension_tokens").update({ revoked: true }).eq("user_id", userId);
  return NextResponse.json({ ok: true, link: "/extension/link" });
} 