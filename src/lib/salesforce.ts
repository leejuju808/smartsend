import { supabaseAdmin } from "@/server/supabase";

async function refresh(teamId: string, refresh_token: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    refresh_token,
  });
  
  const r = await fetch(`${process.env.SALESFORCE_LOGIN_BASE || "https://login.salesforce.com"}/services/oauth2/token`, {
    method: "POST", 
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
    body
  });
  
  const j = await r.json();
  if (!r.ok) throw new Error("SF refresh failed");
  
  await supabaseAdmin.from("salesforce_tokens").update({
    access_token: j.access_token,
    instance_url: j.instance_url || undefined,
    updated_at: new Date().toISOString(),
  }).eq("team_id", teamId);
  
  return { access_token: j.access_token, instance_url: j.instance_url };
}

export async function salesforceFetch(teamId: string, path: string, init?: RequestInit) {
  const { data: row } = await supabaseAdmin
    .from("salesforce_tokens")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();
    
  if (!row) throw new Error("SF not connected");
  
  const go = async (token: string) => {
    const res = await fetch(`${row.instance_url}${path}`, {
      ...(init || {}), 
      headers: { 
        ...(init?.headers || {}), 
        Authorization: `Bearer ${token}`, 
        "Content-Type": "application/json" 
      }
    });
    return res;
  };
  
  let res = await go(row.access_token);
  if (res.status === 401) {
    const rt = await refresh(teamId, row.refresh_token);
    res = await go(rt.access_token);
  }
  
  return res;
} 