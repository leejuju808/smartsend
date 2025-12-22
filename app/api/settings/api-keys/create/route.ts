import { randomBytes } from "crypto";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // find user's workspace
  const { data: ws } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (!ws) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const rawKey = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(rawKey).digest("hex");

  const { error } = await supabase.from("api_keys").insert({
    workspace_id: ws.workspace_id,
    key_hash: hash,
    name: "Default Key"
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ api_key: rawKey });
}



