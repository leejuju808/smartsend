/**
 * Send-time guard: Check if email is suppressed before enqueueing
 * This is a TypeScript helper that can be called before inserting into send_queue
 */
export async function ensureNotSuppressed(
  sb: any,
  accountId: string,
  email: string
): Promise<void> {
  const { data } = await sb
    .from("suppressions")
    .select("id")
    .eq("account_id", accountId)
    .ilike("email", email.toLowerCase())
    .maybeSingle();
  
  if (data) {
    throw new Error("suppressed_recipient");
  }
}















