import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";
import crypto from "node:crypto";

function randomKey() {
  return "sk_live_" + crypto.randomBytes(24).toString("base64url"); // return once; store hash
}
function hashKey(k: string) {
  return crypto.createHash("sha256").update(k).digest("hex");
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k)=>cookieStore.get(k)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = randomKey();
  const { error, data } = await supabase.from("api_keys").insert({
    user_id: user.id, name: name || "Default", key_hash: hashKey(key)
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Show plaintext once
  return NextResponse.json({ ok: true, apiKey: key, id: data!.id });
}