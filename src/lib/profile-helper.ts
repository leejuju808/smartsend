import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Ensures a profile row exists for a user in the profiles table
 * This should be called whenever a user signs in or is created
 */
export async function ensureProfile(userId: string, email?: string) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  
  try {
    // Check if profile exists
    const { data: existing } = await sb
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    // If profile doesn't exist, create it
    if (!existing) {
      await sb.from("profiles").upsert({ 
        id: userId, 
        email: email || null,
        plan: 'free',
        plan_status: 'inactive'
      }, { 
        onConflict: "id" 
      });
    } else if (email && !existing.email) {
      // If email is provided and profile exists but has no email, update it
      await sb
        .from("profiles")
        .update({ email })
        .eq("id", userId);
    }
  } catch (error) {
    console.error("Failed to ensure profile:", error);
    // Don't throw - this is not critical for sign-in
  }
}

