"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

async function sb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

async function getUserIdByEmail(email: string) {
  // MVP: require user to provide the teammate's UID or the teammate must log in once
  // We'll check the profiles table for email matching
  const supabase = await sb();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  
  return data?.id ?? null;
}

export async function addMember(formData: FormData) {
  const campaignId = String(formData.get("campaignId"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = (String(formData.get("role") ?? "viewer") as "sender" | "viewer").toLowerCase();

  const myRole = await getCampaignRole(campaignId);
  if (!can(myRole, "canManageMembers")) {
    throw new Error("Unauthorized");
  }

  const uid = await getUserIdByEmail(email);
  if (!uid) {
    return { ok: false, message: "User not found. Ask them to sign up, then try again." };
  }

  const supabase = await sb();
  const { error } = await supabase.from("campaign_members").upsert(
    {
      campaign_id: campaignId,
      user_id: uid,
      role,
    },
    { onConflict: "campaign_id,user_id" }
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function updateMemberRole(formData: FormData) {
  const campaignId = String(formData.get("campaignId"));
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role") ?? "viewer") as "owner" | "sender" | "viewer";

  const myRole = await getCampaignRole(campaignId);
  if (!can(myRole, "canManageMembers")) {
    throw new Error("Unauthorized");
  }

  // Prevent demoting true creator via this path
  const supabase = await sb();
  const { data: camp } = await supabase
    .from("campaigns")
    .select("user_id")
    .eq("id", campaignId)
    .maybeSingle();
  
  if (camp?.user_id === userId) {
    throw new Error("Cannot change creator's role");
  }

  const { error } = await supabase
    .from("campaign_members")
    .update({ role })
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function removeMember(formData: FormData) {
  const campaignId = String(formData.get("campaignId"));
  const userId = String(formData.get("userId"));

  const myRole = await getCampaignRole(campaignId);
  if (!can(myRole, "canManageMembers")) {
    throw new Error("Unauthorized");
  }

  // Cannot remove creator
  const supabase = await sb();
  const { data: camp } = await supabase
    .from("campaigns")
    .select("user_id")
    .eq("id", campaignId)
    .maybeSingle();
  
  if (camp?.user_id === userId) {
    throw new Error("Cannot remove the campaign owner");
  }

  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

