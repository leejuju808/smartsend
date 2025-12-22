import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function getUserRole() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: member } = await supabase
    .from("team_members")
    .select("role, account_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!member) return null;

  return {
    role: member.role as "owner" | "admin" | "member" | "viewer",
    account_id: member.account_id,
    user_id: userData.user.id,
  };
}

