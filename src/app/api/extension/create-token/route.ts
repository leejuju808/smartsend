import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase";
import { randomToken, sha256Hex } from "@/lib/crypto";

export async function POST(_req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const token = randomToken();                // raw
  const token_hash = sha256Hex(token);        // store hash only
  const expires = new Date(Date.now() + 180*24*3600*1000).toISOString();

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.from("extension_tokens")
    .insert({ user_id: userId, token_hash, expires_at: expires });
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ token });
} 