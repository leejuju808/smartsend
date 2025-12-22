import { createClient } from "@supabase/supabase-js";

const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceUrl || !serviceKey) {
  console.warn("Supabase service credentials are not configured. profile_emails sync will be skipped.");
}

const serviceClient = serviceUrl && serviceKey
  ? createClient(serviceUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export async function syncProfileEmail(userId: string, email: string) {
  if (!serviceClient) return;

  const normalizedEmail = email.toLowerCase();
  const { error } = await serviceClient
    .from("profile_emails")
    .upsert({ user_id: userId, email: normalizedEmail });

  if (error) {
    console.error("Failed to sync profile email", error);
    throw error;
  }
}




