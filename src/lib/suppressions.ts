import { createClient } from "@supabase/supabase-js";

export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function isSuppressed(recipient: string) {
  const sb = supabaseService();
  const { data } = await sb.from('suppression_list').select('recipient').eq('recipient', recipient).maybeSingle();
  return !!data;
}

export async function addSuppression(recipient: string, reason: string, source?: string) {
  const sb = supabaseService();
  const domain = recipient.includes('@') ? recipient.split('@')[1] : null;
  await sb.from('suppression_list').upsert({ recipient, reason, source: source ?? 'system', domain });
}

export async function removeSuppression(recipient: string) {
  const sb = supabaseService();
  await sb.from('suppression_list').delete().eq('recipient', recipient);
}