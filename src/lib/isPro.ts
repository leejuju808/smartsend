// lib/isPro.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function isPro(user_id: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("subscription_status")
    .eq("id", user_id)
    .single();
  if (error) return false;
  return data?.subscription_status === "pro";
} 