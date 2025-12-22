import { createClient } from "@supabase/supabase-js";

export async function syncProfileEmailAndInvites(userId: string, email: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const normalizedEmail = email.toLowerCase();

  const { error: upsertError } = await supabase
    .from("profile_emails")
    .upsert({ user_id: userId, email: normalizedEmail });

  if (upsertError) {
    console.error("syncProfileEmailAndInvites upsert error", upsertError);
  }

  const { data, error: claimError } = await supabase.rpc("claim_pending_invites", {
    p_user: userId,
    p_email: normalizedEmail,
  });

  if (claimError) {
    console.error("syncProfileEmailAndInvites claim error", claimError);
    return 0;
  }

  return (data as number) ?? 0;
}

