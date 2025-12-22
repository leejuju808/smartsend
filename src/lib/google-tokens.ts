import { open, seal } from "@/lib/secure";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function getGmailAccessToken(userId: string) {
  const { data: acc } = await supabaseAdmin
    .from("connected_accounts").select("*")
    .eq("user_id", userId).eq("provider","gmail").single();
  if (!acc) throw new Error("No Gmail account");

  if (new Date(acc.expires_at) > new Date(Date.now()+60_000)) {
    return open(acc.access_token);
  }
  const refresh_token = open(acc.refresh_token);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error("refresh_failed");
  await supabaseAdmin.from("connected_accounts").update({
    access_token: seal(j.access_token),
    expires_at: new Date(Date.now()+j.expires_in*1000).toISOString()
  }).eq("id", acc.id);
  return j.access_token as string;
}

