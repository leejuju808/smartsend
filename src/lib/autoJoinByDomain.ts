import { supabaseAdmin } from "@/server/supabase";
import { syncSeatsToStripe } from "@/lib/seatBilling";

// Block free/email domains from auto-join
const BLOCKED_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "icloud.com", "hotmail.com",
  "aol.com", "protonmail.com", "mail.com", "yandex.com", "zoho.com"
]);

export async function autoJoinByDomain(userId: string, email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || BLOCKED_DOMAINS.has(domain)) return;

  // already on a team?
  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (prof?.team_id) return;

  const { data: claim } = await supabaseAdmin
    .from("company_domains").select("team_id, verified").eq("domain", domain).maybeSingle();

  if (!claim?.verified) return;

  // join member, default role=member
  await supabaseAdmin.from("profiles").update({ team_id: claim.team_id }).eq("id", userId);
  await supabaseAdmin.from("team_members").upsert({
    team_id: claim.team_id, user_id: userId, role: "member"
  });

  // bump seats
  await syncSeatsToStripe(claim.team_id);
} 