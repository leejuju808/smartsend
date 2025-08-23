import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";
import { salesforceFetch } from "@/lib/salesforce";

export async function POST() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
    
  if (!prof?.team_id) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("email, first_name, last_name, company")
    .eq("user_team_id", prof.team_id)
    .limit(300);

  let ok = 0;
  for (const c of contacts || []) {
    if (!c.email) continue;

    try {
      // 1) Lookup existing contact by email
      const soql = encodeURIComponent(`SELECT Id FROM Contact WHERE Email='${c.email.replace(/'/g,"\\'")}' LIMIT 1`);
      const q = await salesforceFetch(prof.team_id, `/services/data/v59.0/query?q=${soql}`);
      const jq = await q.json();
      const existingId = jq?.records?.[0]?.Id;

      if (existingId) {
        // 2) Update existing contact
        await salesforceFetch(prof.team_id, `/services/data/v59.0/sobjects/Contact/${existingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            FirstName: c.first_name || null,
            LastName: c.last_name || null,
            AccountName: c.company || null
          }),
        });
      } else {
        // 2) Create new contact (LastName required)
        await salesforceFetch(prof.team_id, `/services/data/v59.0/sobjects/Contact`, {
          method: "POST",
          body: JSON.stringify({
            Email: c.email,
            FirstName: c.first_name || "",
            LastName: c.last_name || c.email.split("@")[0],
          }),
        });
      }
      ok++;
    } catch (error) {
      console.error(`Failed to sync contact ${c.email}:`, error);
      // Continue with other contacts
    }
  }

  return NextResponse.json({ ok: true, synced: ok });
} 